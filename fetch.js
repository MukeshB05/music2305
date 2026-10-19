// Keep the base URL in one place. VITE_API_BASE_URL can override it for
// preview deployments without editing source files.
const API_URL = (import.meta.env?.VITE_API_BASE_URL || "https://dreamly5api23.vercel.app/api/").replace(/\/?$/, "/");

/*
|--------------------------------------------------------------------------
| Default Settings
|--------------------------------------------------------------------------
*/

const DEFAULT_LIMIT = 150;


/*
|--------------------------------------------------------------------------
| URL Builder
|--------------------------------------------------------------------------
*/

const buildUrl = (endpoint, params = {}) => {
    const url = new URL(endpoint, API_URL);

    Object.entries(params).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            url.searchParams.set(key, value);
        }
    });

    return url.toString();
};


/*
|--------------------------------------------------------------------------
| Common API Request
|--------------------------------------------------------------------------
*/

const apiRequest = async (endpoint, params = {}) => {
    const url = buildUrl(endpoint, params);

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(20000),
        });

        const contentType = response.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const body = await response.text();
            try { data = JSON.parse(body); } catch { data = body; }
        }

        if (!response.ok) {
            const message = data?.message || data?.error || data?.detail ||
                (typeof data === "string" ? data.slice(0, 180) : "");
            throw new Error(message || `HTTP ${response.status} ${response.statusText} for ${new URL(url).pathname}`);
        }

        // Some API routes return HTTP 200 with an error payload.
        if (data && typeof data === "object" && data.success === false) {
            throw new Error(data.message || data.error || "API returned success=false");
        }
        return data;
    } catch (error) {
        console.error("Dreamly5 API request failed:", { url, message: error?.message });
        throw error;
    }
};

// Normalize the different response envelopes used by API deployments so the UI
// always receives a predictable `data.results` array for search results.
const extractResults = (payload, keys = []) => {
    const candidates = [
        payload?.data?.results, payload?.data?.items, payload?.data?.songs?.results,
        payload?.data?.albums?.results, payload?.data?.artists?.results,
        payload?.data?.playlists?.results, payload?.results, payload?.items,
        payload?.songs?.results, payload?.albums?.results, payload?.artists?.results,
        payload?.playlists?.results,
        ...keys.map((key) => payload?.data?.[key]),
        ...keys.map((key) => payload?.[key]),
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate.filter(Boolean);
    }
    return [];
};

const normalizeSearchResponse = (payload, keys = []) => {
    const results = extractResults(payload, keys);
    const outer = payload && typeof payload === "object" ? payload : {};
    const data = outer.data && typeof outer.data === "object" ? outer.data : {};
    return { ...outer, data: { ...data, results } };
};

const searchWithFallback = async (query, limit, type, aliases = []) => {
    const paths = [...new Set([
        ...aliases.flatMap((path) => [
            { path, params: { query, limit } },
            { path, params: { q: query, limit } },
        ]),
        { path: "search", params: { query, type, limit } },
        { path: "search", params: { query, type: `${type}s`, limit } },
        { path: "search", params: { q: query, type, limit } },
    ])];
    let lastError;
    for (const item of paths) {
        try {
            const response = await apiRequest(item.path, item.params);
            const normalized = normalizeSearchResponse(response, [type, `${type}s`, "results", "items"]);
            if (normalized.data.results.length || response?.success !== false) return normalized;
        } catch (error) {
            lastError = error;
        }
    }
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
export const getSearchData = async (
    query,
    limit = DEFAULT_LIMIT
) => {

    if (!query) {
        throw new Error("Search query is required");
    }

    const response = await apiRequest("search", { query, limit });
    return normalizeSearchResponse(response, ["songs", "albums", "artists", "playlists", "results", "items"]);
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
export const getSongbyQuery = async (
    query,
    limit = DEFAULT_LIMIT
) => {

    if (!query) {
        throw new Error("Song search query is required");
    }

    return searchWithFallback(query, limit, "song", ["search/songs", "search/song"]);
};


/**
 * Get song by ID
 *
 * Example:
 * getSongById("123456")
 */
export const getSongById = async (songId) => {

    if (!songId) {
        throw new Error("Song ID is required");
    }

    return apiRequest(
        `songs/${encodeURIComponent(songId)}`
    );
};


/**
 * Get song suggestions
 *
 * Example:
 * getSuggestionSong("123456", 150)
 */
export const getSuggestionSong = async (
    songId,
    limit = DEFAULT_LIMIT
) => {

    if (!songId) {
        throw new Error("Song ID is required");
    }

    return apiRequest(
        `songs/${encodeURIComponent(songId)}/suggestions`,
        {
            limit: limit
        }
    );
};


/**
 * Alias for song suggestions
 */
export const fetchSongSuggestionsByID = async (
    songId,
    limit = DEFAULT_LIMIT
) => {

    if (!songId) {
        throw new Error("Song ID is required");
    }

    return apiRequest(
        `songs/${encodeURIComponent(songId)}/suggestions`,
        {
            limit: limit
        }
    );
};


/**
 * Get lyrics
 *
 * Example:
 * LyricsByID("123456")
 */
export const LyricsByID = async (songId) => {

    if (!songId) {
        throw new Error("Song ID is required");
    }

    return apiRequest(
        `songs/${encodeURIComponent(songId)}/lyrics`
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
export const getArtistbyQuery = async (
    query,
    limit = DEFAULT_LIMIT
) => {

    if (!query) {
        throw new Error("Artist search query is required");
    }

    return searchWithFallback(query, limit, "artist", ["search/artists", "search/artist"]);
};


/**
 * Search artists
 *
 * Alias
 */
export const searchArtistByQuery = async (
    query,
    limit = DEFAULT_LIMIT
) => {

    if (!query) {
        throw new Error("Artist search query is required");
    }

    return searchWithFallback(query, limit, "artist", ["search/artists", "search/artist"]);
};


/**
 * Get artist by ID
 *
 * Example:
 * fetchArtistByID("123456")
 */
export const fetchArtistByID = async (artistId) => {

    if (!artistId) {
        throw new Error("Artist ID is required");
    }

    return apiRequest("artists", {
        id: artistId
    });
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
export const searchAlbumByQuery = async (
    query,
    limit = DEFAULT_LIMIT
) => {

    if (!query) {
        throw new Error("Album search query is required");
    }

    return searchWithFallback(query, limit, "album", ["search/albums", "search/album"]);
};


/**
 * Get album by ID
 *
 * Example:
 * fetchAlbumByID("123456")
 */
export const fetchAlbumByID = async (
    albumId,
    limit = DEFAULT_LIMIT
) => {
    const id = String(albumId ?? "").trim();

    if (!id) {
        throw new Error("Album ID is required");
    }

    // The Dreamly5 API's primary album-detail format is /api/albums?id=ID.
    // Some deployments expose the REST-style /api/albums/ID route instead,
    // so try that only when the primary route fails.
    try {
        return await apiRequest("albums", { id, limit });
    } catch (primaryError) {
        try {
            return await apiRequest(`albums/${encodeURIComponent(id)}`, { limit });
        } catch (fallbackError) {
            throw new Error(
                `Unable to load album ${id}. The API request failed for both album-detail routes. ${fallbackError?.message || primaryError?.message || "Please try again."}`
            );
        }
    }
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
export const searchPlayListByQuery = async (
    query,
    limit = DEFAULT_LIMIT
) => {

    if (!query) {
        throw new Error("Playlist search query is required");
    }

    return searchWithFallback(query, limit, "playlist", ["search/playlists", "search/playlist"]);
};


/**
 * Get playlist by ID
 *
 * Example:
 * fetchplaylistsByID("123456")
 */
export const fetchplaylistsByID = async (
    playlistId,
    limit = DEFAULT_LIMIT
) => {

    if (!playlistId) {
        throw new Error("Playlist ID is required");
    }

    try {
        return await apiRequest("playlists", { id: playlistId, limit });
    } catch (primaryError) {
        try {
            return await apiRequest(`playlists/${encodeURIComponent(playlistId)}`, { limit });
        } catch {
            throw primaryError;
        }
    }
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
    fetchplaylistsByID
};
