import os
import hashlib
import json
import argparse

def sha256_checksum(file_path: str) -> str:
    """Compute SHA-256 checksum of a file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def find_artifacts(root: str) -> list:
    """Find release artifacts: wasm files and npm package tarballs.
    Returns list of (component, file_path) tuples.
    """
    artifacts = []
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            if name.endswith('.wasm'):
                # Component inferred from contract name (parent directory)
                component = os.path.basename(os.path.normpath(dirpath))
                artifacts.append((component, os.path.join(dirpath, name)))
            elif name.endswith('.tgz'):
                # npm package tarball, component from top-level directory name (cli/sdk/react)
                # Find which workspace it belongs to
                parts = dirpath.split(os.sep)
                if "cli" in parts:
                    component = "cli"
                elif "sdk" in parts:
                    component = "sdk"
                elif "react" in parts:
                    component = "react"
                else:
                    component = "unknown"
                artifacts.append((component, os.path.join(dirpath, name)))
    return artifacts

def load_version(component: str) -> str:
    """Load version string for a component.
    For npm packages, read package.json. For wasm contracts, read Cargo.toml.
    """
    try:
        if component in ("cli", "sdk", "react"):
            pkg_path = os.path.join(component, "package.json")
            with open(pkg_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("version", "0.0.0")
        else:
            # Assume Rust crate, look for Cargo.toml in the component directory
            cargo_path = os.path.join(component, "Cargo.toml")
            if os.path.isfile(cargo_path):
                for line in open(cargo_path, "r", encoding="utf-8"):
                    if line.strip().startswith("version"):
                        # line like version = "0.1.0"
                        parts = line.split('=')
                        if len(parts) == 2:
                            return parts[1].strip().strip('"')
        return "0.0.0"
    except Exception:
        return "0.0.0"

def main():
    parser = argparse.ArgumentParser(description="Generate release checksum manifest")
    parser.add_argument("--root", default=".", help="Repository root directory")
    parser.add_argument("--output-dir", default="release_assets", help="Directory to write checksum and manifest files")
    parser.add_argument("--version", default=os.getenv("GITHUB_REF_NAME", "0.0.0"), help="Version identifier (e.g., git tag)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    artifacts = find_artifacts(args.root)

    checksums_path = os.path.join(args.output_dir, "checksums.txt")
    manifest_path = os.path.join(args.output_dir, "manifest.json")

    manifest = []
    with open(checksums_path, "w", encoding="utf-8") as chk_f:
        for component, file_path in artifacts:
            checksum = sha256_checksum(file_path)
            rel_path = os.path.relpath(file_path, args.root).replace(os.sep, "/")
            chk_f.write(f"{checksum}  {rel_path}\n")
            manifest.append({
                "component": component,
                "version": args.version,
                "file": rel_path,
                "checksum": checksum,
            })
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)
    print(f"Generated {checksums_path} and {manifest_path}")

if __name__ == "__main__":
    main()
