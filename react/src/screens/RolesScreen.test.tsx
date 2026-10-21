// SPDX-License-Identifier: MIT
import "@testing-library/jest-dom";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { Role } from "@bc-forge/sdk";
import { BcForgeProvider, WalletProvider } from "../context";
import { useWallet } from "../hooks";
import { RolesScreen } from "./RolesScreen";

const TARGET = "GAVTHAJHFEHX4PZ7GR6O5V2DSJ6G6J4U5XQZ4XK7X5XQZ4XK7X5XQZ4A";
const CALLER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGWEBUSAVCBCY42YOXT";

const mockHasRole = jest.fn();
const mockGrantMinter = jest.fn();
const mockRevokeMinter = jest.fn();
const mockGrantSuperAdmin = jest.fn();
const mockRevokeSuperAdmin = jest.fn();

jest.mock("@bc-forge/sdk", () => ({
  Role: {
    Admin: "Admin",
    SuperAdmin: "SuperAdmin",
    Minter: "Minter",
    Pauser: "Pauser",
  },
  bcForgeClient: jest.fn().mockImplementation(function (
    this: { rpcUrl?: string; contractId?: string },
    config?: { rpcUrl?: string; contractId?: string },
  ) {
    this.rpcUrl = config?.rpcUrl;
    this.contractId = config?.contractId;
    return {
      rpcUrl: config?.rpcUrl,
      contractId: config?.contractId,
      hasRole: (...args: unknown[]) => mockHasRole(...args),
      grantMinter: (...args: unknown[]) => mockGrantMinter(...args),
      revokeMinter: (...args: unknown[]) => mockRevokeMinter(...args),
      grantSuperAdmin: (...args: unknown[]) => mockGrantSuperAdmin(...args),
      revokeSuperAdmin: (...args: unknown[]) => mockRevokeSuperAdmin(...args),
      setWalletAdapter: jest.fn(),
      getContractId: () => config?.contractId ?? "",
    };
  }),
  FreighterAdapter: class {
    name = "freighter";
    connected = false;
    publicKey?: string;
    async connect() {
      this.publicKey =
        "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGWEBUSAVCBCY42YOXT";
      this.connected = true;
    }
    async disconnect() {
      this.publicKey = undefined;
      this.connected = false;
    }
    async signTransaction(xdr: string) {
      return xdr;
    }
  },
  AlbedoAdapter: class {
    name = "albedo";
    connected = false;
    publicKey?: string;
    async connect() {
      this.publicKey = "GAVTHAJHFEHX4PZ7GR6O5V2DSJ6G6J4U5XQZ";
      this.connected = true;
    }
    async disconnect() {
      this.publicKey = undefined;
      this.connected = false;
    }
    async signTransaction(xdr: string) {
      return xdr;
    }
  },
}));

const config = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CA123",
};

/** Establishes a wallet connection on mount when `connected` is true. */
const ConnectOnMount: React.FC<{ connected: boolean }> = ({ connected }) => {
  const { connect } = useWallet();
  React.useEffect(() => {
    if (connected) {
      void connect("freighter");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const renderWithWallet = (connected: boolean) =>
  render(
    <BcForgeProvider config={config}>
      <WalletProvider>
        <RolesScreen debounceMs={0} />
        <ConnectOnMount connected={connected} />
      </WalletProvider>
    </BcForgeProvider>,
  );

describe("RolesScreen", () => {
  beforeEach(() => {
    [
      mockHasRole,
      mockGrantMinter,
      mockRevokeMinter,
      mockGrantSuperAdmin,
      mockRevokeSuperAdmin,
    ].forEach((m) => m.mockReset());
    // Caller is SuperAdmin; target holds Minter only.
    mockHasRole.mockImplementation(async (role: Role, addr: string) =>
      addr === CALLER ? role === Role.SuperAdmin : role === Role.Minter,
    );
    mockGrantMinter.mockResolvedValue({ success: true, hash: "GRANTHASH1" });
    mockRevokeMinter.mockResolvedValue({ success: true, hash: "REVOKEHASH1" });
    mockGrantSuperAdmin.mockResolvedValue({ success: true, hash: "SAGRANT1" });
    mockRevokeSuperAdmin.mockResolvedValue({
      success: true,
      hash: "SAREVOKE1",
    });
  });

  const typeTarget = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText(/target/i), {
      target: { value },
    });

  const connectedWithTarget = async () => {
    renderWithWallet(true);
    await waitFor(() =>
      expect(screen.getByTestId("roles-connected-account")).toHaveTextContent(
        "GBRP…YOXT",
      ),
    );
    typeTarget(TARGET);
    await waitFor(() =>
      expect(screen.getByTestId("role-badge-Minter")).toHaveTextContent(
        "Minter: Granted",
      ),
    );
    await waitFor(() => expect(screen.getByTestId("open-grant")).toBeEnabled());
  };

  it("renders a card per role and badges from hasRole", async () => {
    renderWithWallet(false);
    expect(screen.getAllByTestId(/^role-card-/)).toHaveLength(4);
    typeTarget(TARGET);
    await waitFor(() =>
      expect(screen.getByTestId("role-badge-Minter")).toHaveTextContent(
        "Minter: Granted",
      ),
    );
    expect(screen.getByTestId("role-badge-Admin")).toHaveTextContent(
      "Admin: Not granted",
    );
    expect(screen.getByTestId("role-count")).toHaveTextContent(
      "Roles held: 1 of 4",
    );
    [Role.Admin, Role.SuperAdmin, Role.Minter, Role.Pauser].forEach((r) =>
      expect(mockHasRole).toHaveBeenCalledWith(r, TARGET),
    );
  });

  it("shows a validation error and clears the matrix for an invalid address", async () => {
    renderWithWallet(false);
    typeTarget(TARGET);
    await waitFor(() =>
      expect(screen.getByTestId("role-badge-Minter")).toHaveTextContent(
        "Granted",
      ),
    );
    typeTarget("not-an-address");
    expect(screen.getByTestId("target-error")).toBeInTheDocument();
    expect(screen.queryByTestId("role-count")).not.toBeInTheDocument();
    expect(screen.getByTestId("role-badge-Minter")).toHaveTextContent(
      "Minter: —",
    );
  });

  it("alerts when the lookup fails", async () => {
    mockHasRole.mockRejectedValue(new Error("rpc timeout"));
    renderWithWallet(false);
    typeTarget(TARGET);
    expect(await screen.findByRole("alert")).toHaveTextContent("rpc timeout");
  });

  it("disables actions when the wallet is disconnected", async () => {
    renderWithWallet(false);
    typeTarget(TARGET);
    await waitFor(() =>
      expect(screen.getByTestId("role-badge-Minter")).toHaveTextContent(
        "Granted",
      ),
    );
    expect(screen.getByTestId("open-grant")).toBeDisabled();
    expect(screen.getByTestId("revoke-minter")).toBeDisabled();
  });

  it("disables actions when the caller is not an admin", async () => {
    mockHasRole.mockResolvedValue(false);
    renderWithWallet(true);
    typeTarget(TARGET);
    expect(await screen.findByTestId("not-admin")).toBeInTheDocument();
    expect(screen.getByTestId("open-grant")).toBeDisabled();
  });

  it("grants Minter through the modal and shows success", async () => {
    await connectedWithTarget();
    fireEvent.click(screen.getByTestId("open-grant"));
    expect(screen.getByTestId("grant-role-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Grant" }));
    await waitFor(() => expect(mockGrantMinter).toHaveBeenCalledWith(TARGET));
    expect(await screen.findByRole("status")).toHaveTextContent("GRANTHASH1");
  });

  it("grants SuperAdmin when selected in the dropdown", async () => {
    await connectedWithTarget();
    fireEvent.click(screen.getByTestId("open-grant"));
    fireEvent.click(
      within(screen.getByTestId("grant-role-modal")).getByRole("button", {
        expanded: false,
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Super Admin" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Grant" }));
    await waitFor(() =>
      expect(mockGrantSuperAdmin).toHaveBeenCalledWith(TARGET),
    );
  });

  it("shows an error inside the grant modal when the grant is rejected", async () => {
    mockGrantMinter.mockRejectedValue(new Error("user rejected"));
    await connectedWithTarget();
    fireEvent.click(screen.getByTestId("open-grant"));
    fireEvent.click(screen.getByRole("button", { name: "Grant" }));
    expect(await screen.findByText("user rejected")).toBeInTheDocument();
    expect(screen.getByTestId("grant-role-modal")).toBeInTheDocument();
  });

  it("requires confirmation before revoking Minter", async () => {
    await connectedWithTarget();
    fireEvent.click(screen.getByTestId("revoke-minter"));
    const confirm = screen.getByRole("button", { name: "Revoke" });
    expect(confirm).toBeDisabled();
    expect(mockRevokeMinter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(mockRevokeMinter).toHaveBeenCalledWith(TARGET));
    expect(await screen.findByRole("status")).toHaveTextContent("REVOKEHASH1");
  });

  it("shows an alert when the revoke transaction fails", async () => {
    mockRevokeMinter.mockResolvedValue({ success: false, hash: "FAILHASH" });
    await connectedWithTarget();
    fireEvent.click(screen.getByTestId("revoke-minter"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText(/FAILHASH/)).toBeInTheDocument();
  });
});
