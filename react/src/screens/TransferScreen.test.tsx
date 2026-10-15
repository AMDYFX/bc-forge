// SPDX-License-Identifier: MIT
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransferScreen } from "./TransferScreen";

const mockUseBalance = jest.fn();
const mockTransfer = jest.fn();
const mockEstimate = jest.fn();
let mockFeeData: unknown = null;

jest.mock("../hooks", () => ({
  useBalance: (...args: unknown[]) => mockUseBalance(...args),
  useEstimateFee: () => ({
    estimate: mockEstimate,
    reset: jest.fn(),
    data: mockFeeData,
    loading: false,
    error: null as Error | null,
  }),
  useTransfer: () => ({
    transfer: mockTransfer,
    loading: false,
    error: null as Error | null,
  }),
}));

const ADDRESS = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGWEBUSAVCBCY42YOXT";
const DESTINATION = "GB7B4Z57YDO7PZPO4GBDJJYTYKVOPZNWADPTO7MSKNRZWWTULCA2MB2I";

describe("TransferScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeeData = null;
    mockEstimate.mockResolvedValue({
      feeStroops: 100n,
      feeXlm: "0.0000100",
      recipientExists: true,
    });
    mockUseBalance.mockReturnValue({ data: null, loading: false, error: null });
    mockTransfer.mockResolvedValue({ success: true, hash: "0xtransferhash" });
  });

  it("disables submit while disconnected, when the destination is empty, and for invalid or over-balance amounts", () => {
    mockUseBalance.mockReturnValue({
      data: 1_000n,
      loading: false,
      error: null,
    });

    // Disconnected: no address at all.
    const { rerender } = render(<TransferScreen />);
    expect(screen.getByTestId("transfer-connected-address")).toHaveTextContent(
      "Not connected",
    );
    expect(screen.getByTestId("transfer-submit")).toBeDisabled();

    // Connected but destination empty and amount empty.
    rerender(<TransferScreen walletAddress={ADDRESS} />);
    expect(screen.getByTestId("transfer-balance")).toHaveTextContent("1000");
    expect(screen.getByTestId("transfer-submit")).toBeDisabled();

    // Non-integer / zero amount.
    fireEvent.change(screen.getByLabelText("Destination address"), {
      target: { value: DESTINATION },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "0" },
    });
    expect(screen.getByTestId("transfer-submit")).toBeDisabled();

    // Amount above the displayed balance.
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "1001" },
    });
    expect(screen.getByTestId("transfer-submit")).toBeDisabled();
    expect(screen.getByTestId("transfer-over-balance")).toBeInTheDocument();
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("submits a transfer from the connected address and shows the transaction hash", async () => {
    mockUseBalance.mockReturnValue({
      data: 1_000n,
      loading: false,
      error: null,
    });

    render(<TransferScreen walletAddress={ADDRESS} />);

    fireEvent.change(screen.getByLabelText("Destination address"), {
      target: { value: DESTINATION },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByTestId("transfer-submit"));

    await waitFor(() => {
      expect(mockTransfer).toHaveBeenCalledTimes(1);
    });
    expect(mockTransfer).toHaveBeenCalledWith(ADDRESS, DESTINATION, 250n);

    await waitFor(() => {
      expect(screen.getByTestId("transfer-success")).toHaveTextContent(
        "Transaction hash: 0xtransferhash",
      );
    });
  });

  it("MAX fills the exact raw balance", () => {
    mockUseBalance.mockReturnValue({
      data: 123456789012345678901n,
      loading: false,
      error: null,
    });
    render(<TransferScreen walletAddress={ADDRESS} />);
    fireEvent.click(screen.getByTestId("transfer-max"));
    expect(screen.getByLabelText("Amount")).toHaveValue(
      "123456789012345678901",
    );
  });

  it("disables MAX when the balance is unknown or zero", () => {
    mockUseBalance.mockReturnValue({ data: null, loading: false, error: null });
    const { rerender } = render(<TransferScreen walletAddress={ADDRESS} />);
    expect(screen.getByTestId("transfer-max")).toBeDisabled();
    mockUseBalance.mockReturnValue({ data: 0n, loading: false, error: null });
    rerender(<TransferScreen walletAddress={ADDRESS} />);
    expect(screen.getByTestId("transfer-max")).toBeDisabled();
  });

  it("requests a fee estimate for a valid destination and amount", async () => {
    mockUseBalance.mockReturnValue({
      data: 1_000n,
      loading: false,
      error: null,
    });
    render(<TransferScreen walletAddress={ADDRESS} />);
    fireEvent.change(screen.getByLabelText("Destination address"), {
      target: { value: DESTINATION },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "5" },
    });
    await waitFor(() =>
      expect(mockEstimate).toHaveBeenCalledWith(ADDRESS, DESTINATION, 5n),
    );
  });

  it("shows the fee breakdown and recipient status", () => {
    mockUseBalance.mockReturnValue({
      data: 1_000n,
      loading: false,
      error: null,
    });
    mockFeeData = {
      feeStroops: 100n,
      feeXlm: "0.0000100",
      recipientExists: true,
    };
    render(<TransferScreen walletAddress={ADDRESS} />);
    expect(screen.getByTestId("transfer-fee-xlm")).toHaveTextContent(
      "0.0000100",
    );
    expect(screen.getByTestId("transfer-recipient-status")).toHaveTextContent(
      "found",
    );
  });

  it("blocks submit and warns when the recipient does not exist", () => {
    mockUseBalance.mockReturnValue({
      data: 1_000n,
      loading: false,
      error: null,
    });
    mockFeeData = {
      feeStroops: 100n,
      feeXlm: "0.0000100",
      recipientExists: false,
    };
    render(<TransferScreen walletAddress={ADDRESS} />);
    fireEvent.change(screen.getByLabelText("Destination address"), {
      target: { value: DESTINATION },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "5" },
    });
    expect(
      screen.getByTestId("transfer-recipient-missing"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("transfer-submit")).toBeDisabled();
  });
});
