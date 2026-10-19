
const LRCLIB_BASE_URL = "https://lrclib.net/api";

export function parseLrc(lrcText) {
  if (typeof lrcText !== "string" || !lrcText.trim()) {
    return [];
  }

  const lines = [];
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of lrcText.split(/\r?\n/)) {
    const matches = [...line.matchAll(timeRegex)];
    if (!matches.length) continue;

    const text = line.replace(timeRegex, "").trim();

    // Ignore empty lines and metadata such as [ar:Artist].
    if (!text || /^\[[a-z]{2,3}:.*\]$/i.test(text)) continue;

    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] || "0";

      const milliseconds =
        fraction.length === 1
          ? Number(fraction) * 100
          : fraction.length === 2
            ? Number(fraction) * 10
            : Number(fraction.slice(0, 3));

      lines.push({
        time: minutes * 60 + seconds + milliseconds / 1000,
        text,
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

function cleanMetadata(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getArtistName(song) {
  const artists = song?.artists;

  if (typeof song?.artist === "string") return song.artist;
  if (typeof artists === "string") return artists;

  if (Array.isArray(artists?.primary)) {
    return artists.primary
      .map((artist) => artist?.name)
      .filter(Boolean)
      .join(", ");
  }

  if (Array.isArray(artists)) {
    return artists
      .map((artist) =>
        typeof artist === "string" ? artist : artist?.name
      )
      .filter(Boolean)
      .join(", ");
  }

  return artists?.primary?.name || "";
}

function getTrackName(song) {
  return cleanMetadata(
    song?.name ||
      song?.title ||
      song?.song ||
      song?.trackName
  )
    .replace(/\s*[\[(].*?[\])]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDuration(song) {
  const value = Number(
    song?.duration ?? song?.length ?? song?.songDuration
  );

  if (!Number.isFinite(value) || value <= 0) return undefined;

  // Most JioSaavn song durations are in seconds.
  // Handle millisecond durations if provided by another source.
  return Math.round(value > 10000 ? value / 1000 : value);
}

function plainLyricsResult(text) {
  const plain = String(text || "").trim();

  return {
    synced: false,
    lines: plain
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ time: 0, text })),
    plain,
  };
}

function lyricsResult(data) {
  if (data?.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);

    if (lines.length) {
      return {
        synced: true,
        lines,
        plain: data.plainLyrics || "",
      };
    }
  }

  if (data?.plainLyrics?.trim()) {
    return plainLyricsResult(data.plainLyrics);
  }

  return null;
}

/**
 * Fetch lyrics for an individual song.
 * Accepts a song object or (trackName, artistName, duration).
 */
export async function fetchSyncedLyrics(
  trackOrName,
  artistName = "",
  duration,
  options = {}
) {
  const song =
    trackOrName && typeof trackOrName === "object"
      ? trackOrName
      : null;

  const trackName = song
    ? getTrackName(song)
    : cleanMetadata(trackOrName);

  const artist = song
    ? getArtistName(song)
    : cleanMetadata(artistName);

  const trackDuration = song
    ? getDuration(song)
    : getDuration({ duration });

  const emptyResult = {
    synced: false,
    lines: [],
    plain: "No lyrics available for this song.",
  };

  if (!trackName) return emptyResult;

  const signal = options?.signal;

  const request = async (url) => {
    const response = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return null;

    return response.json();
  };

  try {
    // First try LRCLIB exact matching.
    const params = new URLSearchParams({
      track_name: trackName,
    });

    if (artist) params.set("artist_name", artist);
    if (trackDuration) {
      params.set("duration", String(trackDuration));
    }

    try {
      const data = await request(
        `${LRCLIB_BASE_URL}/get?${params.toString()}`
      );

      const result = lyricsResult(data);
      if (result) return result;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }

    // Search fallback for alternate spellings and metadata.
    const searchParams = new URLSearchParams({
      q: `${trackName} ${artist}`.trim(),
    });

    const results = await request(
      `${LRCLIB_BASE_URL}/search?${searchParams.toString()}`
    );

    if (!Array.isArray(results) || !results.length) {
      return emptyResult;
    }

    // Prefer the matching song and duration, then synced lyrics.
    const normalizedTrack = trackName.toLowerCase();

    const ranked = results
      .map((item) => {
        let score = 0;
        const candidate = cleanMetadata(item?.trackName).toLowerCase();
        const candidateArtist = cleanMetadata(item?.artistName).toLowerCase();

        if (candidate === normalizedTrack) score += 10;
        else if (
          candidate &&
          (candidate.includes(normalizedTrack) ||
            normalizedTrack.includes(candidate))
        ) {
          score += 4;
        }

        if (
          artist &&
          candidateArtist &&
          candidateArtist.includes(artist.toLowerCase().split(",")[0])
        ) {
          score += 5;
        }

        if (trackDuration && Number(item?.duration)) {
          const difference = Math.abs(
            Number(item.duration) - trackDuration
          );

          if (difference <= 2) score += 5;
          else if (difference <= 8) score += 2;
          else score -= 5;
        }

        if (item?.syncedLyrics) score += 2;
        if (item?.plainLyrics) score += 1;

        return { item, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const { item } of ranked) {
      const result = lyricsResult(item);
      if (result) return result;
    }

    return emptyResult;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    console.error("LRCLIB lyrics error:", error);

    return {
      synced: false,
      lines: [],
      plain: "Could not load lyrics. Please try again.",
    };
  }
}
