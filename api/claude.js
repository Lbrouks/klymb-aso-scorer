export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { appId, country, system, messages } = req.body;

  try {
    // Fetch iTunes data server-side
    let itunesData = null;
    if (appId) {
      const itunesRes = await fetch(
        `https://itunes.apple.com/lookup?id=${appId}&country=${country || 'us'}`
      );
      if (itunesRes.ok) {
        itunesData = await itunesRes.json();
      }
    }

    // Inject iTunes data into the user message
    const enrichedMessages = messages.map((msg, i) => {
      if (i === 0 && itunesData && itunesData.results && itunesData.results[0]) {
        const app = itunesData.results[0];
        const itunesContext = `
ITUNES API DATA (fetched server-side):
- trackName: ${app.trackName}
- artistName: ${app.artistName}
- primaryGenreName: ${app.primaryGenreName}
- averageUserRating: ${app.averageUserRating}
- userRatingCount: ${app.userRatingCount}
- version: ${app.version}
- currentVersionReleaseDate: ${app.currentVersionReleaseDate}
- formattedPrice: ${app.formattedPrice}
- screenshotUrls count: ${(app.screenshotUrls || []).length}
- artworkUrl100: ${app.artworkUrl100 || 'none'}
- description: ${(app.description || '').slice(0, 3000)}
`;
        if (typeof msg.content === 'string') {
          return { ...msg, content: msg.content + '\n\n' + itunesContext };
        }
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: [
              ...msg.content,
              { type: 'text', text: itunesContext }
            ]
          };
        }
      }
      return msg;
    });

    // Call Claude without web_fetch tool
    const claudeBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: system.replace(/TASK:[\s\S]*?2\. After/m, 'TASK:\n1. Use the ITUNES API DATA provided below in the user message.\n2. After'),
      messages: enrichedMessages,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeBody)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
