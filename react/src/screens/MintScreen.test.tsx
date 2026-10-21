// SPDX-License-Identifier: MIT
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BcForgeProvider, WalletProvider } from "../context";
import { useWallet } from "../hooks";
import { MintScreen } from "./MintScreen";

const RECIPIENT = "GAVTHAJHFEHX4PZ7GR6O5V2DSJ6G6J4U5XQZ4XK7X5XQZ4XK7X5XQZ";

const mockMint = jest.fn();
const mockHasRole = jest.fn();

jest.mock("@bc-forge/sdk", () => ({
  Role: { Minter: "Minter" },
  bcForgeClient: jest.fn().mockImplementation(() => ({
    mint: (...args: unknown[]) => mockMint(...args),
    hasRole: (...args: unknown[]) => mockHasRole(...args),
    setWalletAdapter: jest.fn(),
  })),
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
      this.publicKey = "GAVTHAJHFEHX4PZ7GR6O5V2DSJ6G6J4U5XQZ4XK7X5XQZ";
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
        <MintScreen />
        <ConnectOnMount connected={connected} />
      </WalletProvider>
    </BcForgeProvider>,
  );

describe("MintScreen", () => {
  beforeEach(() => {
    mockMint.mockReset();
    mockHasRole.mockReset();
    mockHasRole.mockResolvedValue(true);
    mockMint.mockResolvedValue({ success: true, hash: "ABC123HASH" });
  });

  it("keeps submit disabled while the wallet is disconnected", async () => {
    renderWithWallet(false);

    await waitFor(() => {
      expect(screen.getByTestId("mint-connected-account")).toHaveTextContent(
        "Not connected",
      );
    });

    expect(screen.getByRole("button", { name: /^mint$/i })).toBeDisabled();
  });

  it("blocks submission when the recipient address is empty", async () => {
    renderWithWallet(true);

    await waitFor(() => {
      expect(screen.getByTestId("mint-connected-account")).toHaveTextContent(
        "GBRP…YOXT",
      );
    });

    const submit = screen.getByRole("button", { name: /^mint$/i });
    expect(submit).toBeDisabled();

    // Amount is valid but address is empty → still disabled, mint never called.
    fireEvent.change(screen.getByPlaceholderText(/positive integer amount/i), {
      target: { value: "100" },
    });
    expect(submit).toBeDisabled();

    fireEvent.submit(screen.getByTestId("mint-form"));
    expect(mockMint).not.toHaveBeenCalled();
  });

  it("blocks submission when the amount is not a positive integer", async () => {
    renderWithWallet(true);

    await waitFor(() => {
      expect(screen.getByTestId("mint-connected-account")).toHaveTextContent(
        "GBRP…YOXT",
      );
    });

    fireEvent.change(screen.getByPlaceholderText(/recipient/i), {
      target: { value: RECIPIENT },
    });
    fireEvent.change(screen.getByPlaceholderText(/positive integer amount/i), {
      target: { value: "0" },
    });

    expect(screen.getByRole("button", { name: /^mint$/i })).toBeDisabled();
    expect(
      screen.getByTestId("mint-amount-validation-error"),
    ).toHaveTextContent(/greater than zero/i);
  });

  it("displays immediate red error banner and disables submit for decimals, negatives, and exponential notation (#1205)", async () => {
    renderWithWallet(true);

    await waitFor(() => {
      expect(screen.getByTestId("mint-connected-account")).toHaveTextContent(
        "GBRP…YOXT",
      );
    });

    const recipientInput = screen.getByPlaceholderText(/recipient/i);
    const amountInput = screen.getByPlaceholderText(/positive integer amount/i);
    const submit = screen.getByRole("button", { name: /^mint$/i });

    fireEvent.change(recipientInput, { target: { value: RECIPIENT } });

    // Negative number
    fireEvent.change(amountInput, { target: { value: "-50" } });
    expect(submit).toBeDisabled();
    expect(
      screen.getByTestId("mint-amount-validation-error"),
    ).toHaveTextContent(/cannot be negative/i);

    // Decimal number
    fireEvent.change(amountInput, { target: { value: "12.34" } });
    expect(submit).toBeDisabled();
    expect(
      screen.getByTestId("mint-amount-validation-error"),
    ).toHaveTextContent(/cannot contain decimals/i);

    // Exponential notation
    fireEvent.change(amountInput, { target: { value: "1e5" } });
    expect(submit).toBeDisabled();
    expect(
      screen.getByTestId("mint-amount-validation-error"),
    ).toHaveTextContent(/cannot use exponential notation/i);

    // Valid positive base-10 integer
    fireEvent.change(amountInput, { target: { value: "500" } });
    expect(submit).toBeEnabled();
    expect(
      screen.queryByTestId("mint-amount-validation-error"),
    ).not.toBeInTheDocument();
  });

  it("calls mint exactly once on a valid submit and renders the tx hash", async () => {
    renderWithWallet(true);

    await waitFor(() => {
      expect(screen.getByTestId("mint-connected-account")).toHaveTextContent(
        "GBRP…YOXT",
      );
    });

    fireEvent.change(screen.getByPlaceholderText(/recipient/i), {
      target: { value: RECIPIENT },
    });
    fireEvent.change(screen.getByPlaceholderText(/positive integer amount/i), {
      target: { value: "250" },
    });

    const submit = screen.getByRole("button", { name: /^mint$/i });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);

    await waitFor(() => {
      expect(mockMint).toHaveBeenCalledTimes(1);
    });
    expect(mockMint).toHaveBeenCalledWith(RECIPIENT, 250n, undefined);

    expect(await screen.findByTestId("tx-hash")).toHaveTextContent(
      "ABC123HASH",
    );
  });

  it("shows an Alert when mint fails", async () => {
    mockMint.mockResolvedValue({ success: false, hash: "DEADBEEF" });
    renderWithWallet(true);

    await waitFor(() => {
      expect(screen.getByTestId("mint-connected-account")).toHaveTextContent(
        "GBRP…YOXT",
      );
    });

    fireEvent.change(screen.getByPlaceholderText(/recipient/i), {
      target: { value: RECIPIENT },
    });
    fireEvent.change(screen.getByPlaceholderText(/positive integer amount/i), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^mint$/i }));

    await waitFor(() => {
      expect(mockMint).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("DEADBEEF");
  });

  it("shows a Minter role warning and disables submit for non-minters", async () => {
    mockHasRole.mockResolvedValue(false);
    renderWithWallet(true);

    await waitFor(() => {
      expect(screen.getByTestId("mint-role-warning")).toHaveTextContent(
        /minter role required/i,
      );
    });
    fireEvent.change(screen.getByPlaceholderText(/recipient/i), {
      target: { value: RECIPIENT },
    });
    fireEvent.change(screen.getByPlaceholderText(/positive integer amount/i), {
      target: { value: "100" },
    });
    expect(screen.getByRole("button", { name: /^mint$/i })).toBeDisabled();
  });

  it("does not show the warning for minters", async () => {
    renderWithWallet(true);
    await waitFor(() => expect(mockHasRole).toHaveBeenCalled());
    expect(screen.queryByTestId("mint-role-warning")).not.toBeInTheDocument();
  });
});
