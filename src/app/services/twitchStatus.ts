/**
 * Real Twitch live-status check.
 *
 * This does NOT use the official Helix API, because Helix requires an
 * app access token (client ID + client secret), and the secret can never
 * be safely embedded in client-side code - anyone could read it out of
 * the built JS bundle.
 *
 * Instead this sends a plain GraphQL query to Twitch's public GQL
 * endpoint using the client ID that Twitch's own website/player uses for
 * logged-out visitors. It's undocumented but widely relied on. An earlier
 * version of this used one of Twitch's internal "persisted query" hashes
 * instead of an inline query string - Twitch rotated/invalidated that
 * hash without notice, which silently broke live detection. Sending the
 * query text directly (as done here) avoids depending on their specific
 * persisted-query registry, so it's less likely to break the same way -
 * but since the endpoint itself is still undocumented, Twitch could
 * change or block it entirely at some point. If that happens, the
 * reliable long-term fix is a small backend that calls the real Helix
 * API with your own client ID/secret.
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
      body: JSON.stringify({
        query: `query ($login: String!) { user(login: $login) { stream { id } } }`,
        variables: { login: channel },
      }),
    });

    if (!response.ok) return false;

    const json = await response.json();

    if (json?.errors) {
      console.error('Twitch GQL returned an error:', json.errors);
      return false;
    }

    const stream = json?.data?.user?.stream;
    return Boolean(stream);
  } catch (error) {
    console.error('Twitch live-status check failed:', error);
    return false;
  }
}
