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

    return apiRequest("search", {
        query: query,
        limit: limit
    });
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

    return apiRequest("search/songs", {
        query: query,
        limit: limit
    });
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

    return apiRequest("search/artists", {
        query: query,
        limit: limit
    });
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

    return apiRequest("search/artists", {
        query: query,
        limit: limit
    });
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

    try {
        return await apiRequest("search/albums", { query, limit });
    } catch (primaryError) {
        try {
            return await apiRequest("search", { query, type: "album", limit });
        } catch {
            throw primaryError;
        }
    }
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

    try {
        return await apiRequest("search/playlists", { query, limit });
    } catch (primaryError) {
        try {
            return await apiRequest("search", { query, type: "playlist", limit });
        } catch {
            throw primaryError;
        }
    }
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
