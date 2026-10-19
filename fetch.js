/*
|--------------------------------------------------------------------------
| Base URL (single source of truth)
|--------------------------------------------------------------------------
| VITE_API_BASE_URL can override this for preview deployments.
| The base is normalized to exactly one trailing slash so that relative
| endpoints always resolve under the same prefix (e.g. /api/).
*/

const DEFAULT_API_BASE = "https://dreamly5api23.vercel.app/api/";

const RAW_BASE = String(
    import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE
).trim();

const API_URL = `${RAW_BASE.replace(/\/+$/, "")}/`;

export const API_BASE_URL = API_URL;

const DEFAULT_LIMIT = 150;
const DEFAULT_TIMEOUT = 20000;

/*
|--------------------------------------------------------------------------
| Small helpers
|--------------------------------------------------------------------------
*/

const safePath = (url) => {
    try {
        return new URL(url).pathname;
    } catch {
        return String(url);
    }
};

const readResponseBody = async (response) => {
    if (response.status === 204 || response.status === 205) return null;

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json") || contentType.includes("+json")) {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const responseErrorMessage = (data) => {
    if (!data) return "";
    if (typeof data === "string") return data.slice(0, 180);

    const message =
        data.message ||
        data.error ||
        data.detail ||
        data.status_message;

    if (typeof message === "string") return message;
    if (message && typeof message === "object" && typeof message.message === "string") {
        return message.message;
    }
    return "";
};

/**
 * Try a list of request thunks in order and return the first success.
 * The last error is re-thrown with the supplied context so callers always
 * get a meaningful message.
 */
const firstSuccessful = async (attempts, context) => {
    let lastError;
    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (error) {
            lastError = error;
        }
    }
    const detail = lastError?.message ? ` ${lastError.message}` : "";
    throw new Error(`${context}${detail}`);
};

/*
|--------------------------------------------------------------------------
| URL Builder
|--------------------------------------------------------------------------
| Built by concatenation (never relative resolution) so a leading "/" in an
| endpoint can never strip the /api/ prefix.
*/

const buildUrl = (endpoint, params = {}) => {
    const base = API_URL.replace(/\/+$/, "");
    const path = String(endpoint ?? "").replace(/^\/+/, "");

    let url;
    try {
        url = new URL(`${base}/${path}`);
    } catch {
        throw new Error(`Invalid API endpoint "${endpoint}" (base: "${API_URL}")`);
    }

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
};

/*
|--------------------------------------------------------------------------
| Common API Request
|--------------------------------------------------------------------------
*/

const apiRequest = async (endpoint, params = {}, options = {}) => {
    const url = buildUrl(endpoint, params);
    const { timeout = DEFAULT_TIMEOUT, signal: externalSignal } = options;

    const controller = new AbortController();
    let timedOut = false;

    const timer =
        Number.isFinite(timeout) && timeout > 0
            ? setTimeout(() => {
                  timedOut = true;
                  controller.abort();
              }, timeout)
            : null;

    let detachExternal;
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            detachExternal = () => controller.abort();
            externalSignal.addEventListener("abort", detachExternal, { once: true });
        }
    }

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });

        const data = await readResponseBody(response);

        if (!response.ok) {
            const message = responseErrorMessage(data);
            throw new Error(
                message ||
                    `HTTP ${response.status} ${response.statusText || ""} for ${safePath(url)}`.trim()
            );
        }

        // Some API routes return HTTP 200 with an error payload.
        if (data && typeof data === "object" && !Array.isArray(data) && data.success === false) {
            throw new Error(
                data.message || data.error || data.detail || "API returned success=false"
            );
        }

        return data;
    } catch (error) {
        let finalError = error;

        if (timedOut) {
            finalError = new Error(`Request timed out after ${timeout} ms: ${safePath(url)}`);
        } else if (error?.name === "AbortError") {
            finalError = new Error(`Request cancelled: ${safePath(url)}`);
        } else if (error instanceof TypeError) {
            finalError = new Error(
                `Network error while contacting the API (${safePath(url)}): ${error.message}`
            );
        }

        console.error("Dreamly5 API request failed:", {
            url,
            message: finalError?.message,
        });

        throw finalError;
    } finally {
        if (timer) clearTimeout(timer);
        if (detachExternal) externalSignal.removeEventListener("abort", detachExternal);
    }
};

/*
|--------------------------------------------------------------------------
| Response Normalization
|--------------------------------------------------------------------------
*/

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : null);

// Normalize the different response envelopes used by API deployments so the UI
// always receives a predictable `data.results` array for search results.
const extractResults = (payload, keys = []) => {
    if (Array.isArray(payload)) return payload.filter(Boolean);
    if (!payload || typeof payload !== "object") return [];

    const rawData = payload.data;
    const data =
        rawData && typeof rawData === "object" && !Array.isArray(rawData) ? rawData : null;
    const dataArray = Array.isArray(rawData) ? rawData : null;

    const candidates = [
        dataArray,
        data?.results,
        data?.items,
        data?.songs?.results,
        data?.albums?.results,
        data?.artists?.results,
        data?.playlists?.results,
        data?.songs,
        data?.albums,
        data?.artists,
        data?.playlists,
        payload.results,
        payload.items,
        payload.songs?.results,
        payload.albums?.results,
        payload.artists?.results,
        payload.playlists?.results,
        ...keys.flatMap((key) => [data?.[key], payload?.[key]]),
    ];

    for (const candidate of candidates) {
        const array = asArray(candidate);
        if (array) return array;
    }

    return [];
};

const normalizeSearchResponse = (payload, keys = []) => {
    const results = extractResults(payload, keys);
    const outer =
        payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

    const rawData = outer.data;
    const data =
        rawData && typeof rawData === "object" && !Array.isArray(rawData)
            ? { ...rawData }
            : Array.isArray(rawData)
              ? { items: rawData }
              : {};

    return { ...outer, data: { ...data, results } };
};

const searchWithFallback = async (query, limit, type, aliases = []) => {
    const candidates = [];
    const seen = new Set();

    const push = (path, params) => {
        const key = `${path}?${new URLSearchParams(params).toString()}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ path, params });
    };

    aliases.forEach((path) => {
        push(path, { query, limit });
        push(path, { q: query, limit });
    });

    push("search", { query, type, limit });
    push("search", { query, type: `${type}s`, limit });
    push("search", { q: query, type, limit });

    let lastError;
    let bestEmpty = null;

    for (const item of candidates) {
        try {
            const response = await apiRequest(item.path, item.params);
            const normalized = normalizeSearchResponse(response, [
                type,
                `${type}s`,
                "results",
                "items",
            ]);

            if (normalized.data.results.length) return normalized;
            if (!bestEmpty) bestEmpty = normalized;
        } catch (error) {
            lastError = error;
        }
    }

    if (bestEmpty) return bestEmpty;

    throw lastError || new Error(`Unable to search ${type}.`);
};

/*
|--------------------------------------------------------------------------
| GENERAL SEARCH
|--------------------------------------------------------------------------
*/

/**
 * Search everything
 *
 * Example:
 * getSearchData("Arijit Singh")
 */
export const getSearchData = async (query, limit = DEFAULT_LIMIT) => {
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Search query is required");

    const response = await firstSuccessful(
        [
            () => apiRequest("search", { query: q, limit }),
            () => apiRequest("search", { q, limit }),
        ],
        "Search request failed."
    );

    return normalizeSearchResponse(response, [
        "songs",
        "albums",
        "artists",
        "playlists",
        "results",
        "items",
    ]);
};

/*
|--------------------------------------------------------------------------
| SONGS
|--------------------------------------------------------------------------
*/

/**
 * Search songs
 *
 * Example:
 * getSongbyQuery("Tum Hi Ho", 150)
 */
export const getSongbyQuery = async (query, limit = DEFAULT_LIMIT) => {
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Song search query is required");

    return searchWithFallback(q, limit, "song", ["search/songs", "search/song"]);
};

/**
 * Get song by ID
 *
 * Example:
 * getSongById("123456")
 */
export const getSongById = async (songId) => {
    const id = String(songId ?? "").trim();
    if (!id) throw new Error("Song ID is required");

    const encoded = encodeURIComponent(id);

    return firstSuccessful(
        [
            () => apiRequest(`songs/${encoded}`),
            () => apiRequest("songs", { id }),
        ],
        `Unable to load song ${id}.`
    );
};

/**
 * Get song suggestions
 *
 * Example:
 * getSuggestionSong("123456", 150)
 */
export const getSuggestionSong = async (songId, limit = DEFAULT_LIMIT) => {
    const id = String(songId ?? "").trim();
    if (!id) throw new Error("Song ID is required");

    const encoded = encodeURIComponent(id);

    return firstSuccessful(
        [
            () => apiRequest(`songs/${encoded}/suggestions`, { limit }),
            () => apiRequest("suggestions", { id, limit }),
        ],
        `Unable to load suggestions for song ${id}.`
    );
};

/**
 * Alias for song suggestions
 */
export const fetchSongSuggestionsByID = async (songId, limit = DEFAULT_LIMIT) =>
    getSuggestionSong(songId, limit);

/**
 * Get lyrics
 *
 * Example:
 * LyricsByID("123456")
 */
export const LyricsByID = async (songId) => {
    const id = String(songId ?? "").trim();
    if (!id) throw new Error("Song ID is required");

    const encoded = encodeURIComponent(id);

    return firstSuccessful(
        [
            () => apiRequest(`songs/${encoded}/lyrics`),
            () => apiRequest("lyrics", { id }),
        ],
        `Unable to load lyrics for song ${id}.`
    );
};

/*
|--------------------------------------------------------------------------
| ARTISTS
|--------------------------------------------------------------------------
*/

/**
 * Search artists
 *
 * Example:
 * getArtistbyQuery("Arijit Singh", 150)
 */
export const getArtistbyQuery = async (query, limit = DEFAULT_LIMIT) => {
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Artist search query is required");

    return searchWithFallback(q, limit, "artist", ["search/artists", "search/artist"]);
};

/**
 * Search artists (alias)
 */
export const searchArtistByQuery = async (query, limit = DEFAULT_LIMIT) =>
    getArtistbyQuery(query, limit);

/**
 * Get artist by ID
 *
 * Example:
 * fetchArtistByID("123456")
 */
export const fetchArtistByID = async (artistId) => {
    const id = String(artistId ?? "").trim();
    if (!id) throw new Error("Artist ID is required");

    return firstSuccessful(
        [
            () => apiRequest("artists", { id }),
            () => apiRequest(`artists/${encodeURIComponent(id)}`),
        ],
        `Unable to load artist ${id}.`
    );
};

/*
|--------------------------------------------------------------------------
| ALBUMS
|--------------------------------------------------------------------------
*/

/**
 * Search albums
 *
 * Example:
 * searchAlbumByQuery("Aashiqui 2", 150)
 */
export const searchAlbumByQuery = async (query, limit = DEFAULT_LIMIT) => {
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Album search query is required");

    return searchWithFallback(q, limit, "album", ["search/albums", "search/album"]);
};

/**
 * Get album by ID
 *
 * Example:
 * fetchAlbumByID("123456")
 */
export const fetchAlbumByID = async (albumId, limit = DEFAULT_LIMIT) => {
    const id = String(albumId ?? "").trim();
    if (!id) throw new Error("Album ID is required");

    // The Dreamly5 API's primary album-detail format is /api/albums?id=ID.
    // Some deployments expose the REST-style /api/albums/ID route instead.
    return firstSuccessful(
        [
            () => apiRequest("albums", { id, limit }),
            () => apiRequest(`albums/${encodeURIComponent(id)}`, { limit }),
        ],
        `Unable to load album ${id}.`
    );
};

/*
|--------------------------------------------------------------------------
| PLAYLISTS
|--------------------------------------------------------------------------
*/

/**
 * Search playlists
 *
 * Example:
 * searchPlayListByQuery("Workout", 150)
 */
export const searchPlayListByQuery = async (query, limit = DEFAULT_LIMIT) => {
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Playlist search query is required");

    return searchWithFallback(q, limit, "playlist", ["search/playlists", "search/playlist"]);
};

/**
 * Get playlist by ID
 *
 * Example:
 * fetchplaylistsByID("123456")
 */
export const fetchplaylistsByID = async (playlistId, limit = DEFAULT_LIMIT) => {
    const id = String(playlistId ?? "").trim();
    if (!id) throw new Error("Playlist ID is required");

    return firstSuccessful(
        [
            () => apiRequest("playlists", { id, limit }),
            () => apiRequest(`playlists/${encodeURIComponent(id)}`, { limit }),
        ],
        `Unable to load playlist ${id}.`
    );
};

/*
|--------------------------------------------------------------------------
| DEFAULT EXPORT
|--------------------------------------------------------------------------
*/

export default {
    // Search
    getSearchData,

    // Songs
    getSongbyQuery,
    getSongById,
    getSuggestionSong,
    fetchSongSuggestionsByID,
    LyricsByID,

    // Artists
    getArtistbyQuery,
    searchArtistByQuery,
    fetchArtistByID,

    // Albums
    searchAlbumByQuery,
    fetchAlbumByID,

    // Playlists
    searchPlayListByQuery,
    fetchplaylistsByID,
};
