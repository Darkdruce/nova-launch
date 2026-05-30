import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebhookSubscriptionList } from "../WebhookSubscriptionList";

vi.mock("../../../hooks/useWallet", () => ({
  useWallet: () => ({
    wallet: { connected: true, address: "wallet1", network: "testnet" },
  }),
}));

const mockSubs = [
  {
    id: "sub-1",
    url: "https://example.com/webhook-a",
    tokenAddress: null,
    events: ["token.created"],
    secret: "****",
    active: true,
    createdBy: "wallet1",
    createdAt: new Date().toISOString(),
    lastTriggered: null,
  },
  {
    id: "sub-2",
    url: "https://othersite.com/hook",
    tokenAddress: null,
    events: ["token.burn.self"],
    secret: "****",
    active: false,
    createdBy: "wallet1",
    createdAt: new Date().toISOString(),
    lastTriggered: null,
  },
];

vi.mock("../../../services/webhookApi", () => ({
  webhookApi: {
    listSubscriptions: vi.fn(() => Promise.resolve(mockSubs)),
    toggleStatus: vi.fn(),
    unsubscribe: vi.fn(),
    testWebhook: vi.fn(() => Promise.resolve({ message: "ok" })),
  },
  WebhookEventType: {
    TOKEN_BURN_SELF: "token.burn.self",
    TOKEN_BURN_ADMIN: "token.burn.admin",
    TOKEN_CREATED: "token.created",
    TOKEN_METADATA_UPDATED: "token.metadata.updated",
  },
}));

describe("WebhookSubscriptionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters subscriptions by URL text", async () => {
    render(<WebhookSubscriptionList />);

    // wait for subscriptions to load
    await waitFor(() =>
      expect(screen.getByText(/webhook-a/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/othersite.com/)).toBeInTheDocument();

    const input = screen.getByLabelText("Search webhooks");
    await userEvent.type(input, "example");

    expect(screen.getByText(/webhook-a/)).toBeInTheDocument();
    expect(screen.queryByText(/othersite.com/)).not.toBeInTheDocument();
  });

  it("filters subscriptions by event text", async () => {
    render(<WebhookSubscriptionList />);
    await waitFor(() =>
      expect(screen.getByText(/webhook-a/)).toBeInTheDocument(),
    );

    const input = screen.getByLabelText("Search webhooks");
    await userEvent.type(input, "burn");

    expect(screen.getByText(/othersite.com/)).toBeInTheDocument();
    expect(screen.queryByText(/webhook-a/)).not.toBeInTheDocument();
  });

  it("shows empty state message when no matches and query active", async () => {
    render(<WebhookSubscriptionList />);
    await waitFor(() =>
      expect(screen.getByText(/webhook-a/)).toBeInTheDocument(),
    );

    const input = screen.getByLabelText("Search webhooks");
    await userEvent.type(input, "nomatch");

    expect(
      screen.getByText(/No subscriptions match your search/),
    ).toBeInTheDocument();
  });
});
