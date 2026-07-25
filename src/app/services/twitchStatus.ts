/**
 * Real Twitch live-status check.
 *
 * This does NOT use the official Helix API, because Helix requires an
 * app access token (client ID + client secret), and the secret can never
 * be safely embedded in client-side code - anyone could read it out of
 * the built JS bundle.
 *
 * Instead this uses Twitch's public GQL endpoint with the client ID that
 * Twitch's own website/player uses for logged-out visitors. It's
 * undocumented but widely relied on (many open-source "is streamer live"
 * widgets use exactly this), requires no secret, and works from the
 * browser with no backend. Because it's undocumented, Twitch could
 * change or break it without notice - if this stops working, the
 * reliable long-term fix is standing up a tiny backend that calls the
 * real Helix API with your own client ID/secret.
 */

const TWITCH_PUBLIC_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

export async function isTwitchChannelLive(channel: string): Promise<boolean> {
  try {
    const response = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-Id': TWITCH_PUBLIC_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          operationName: 'StreamMetadata',
          variables: { channelLogin: channel },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                '1c719a40e481453e5c48d9bb585d971b8b372f8ffabca2861ebd7c4a5c00b0a3',
            },
          },
        },
      ]),
    });

    if (!response.ok) return false;

    const json = await response.json();
    const stream = json?.[0]?.data?.user?.stream;
    return Boolean(stream);
  } catch (error) {
    console.error('Twitch live-status check failed:', error);
    return false;
  }
}
