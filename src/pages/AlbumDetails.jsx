import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaHeart, FaRegHeart, FaPlay } from "react-icons/fa6";
import { IoShareSocial } from "react-icons/io5";
import {
  MdOutlineKeyboardArrowLeft,
  MdOutlineKeyboardArrowRight,
} from "react-icons/md";

import MusicContext from "../context/MusicContext";
import Navbar from "../components/Navbar";
import SongsList from "../components/SongsList";
import Footer from "../components/footer";
import Navigator from "../components/Navigator";
import SongGrid from "../components/SongGrid";
import AlbumItems from "../components/Items/AlbumItems";
import ArtistItems from "../components/Items/ArtistItems";
import { fetchAlbumByID, getSuggestionSong, searchAlbumByQuery, getArtistbyQuery, getSongbyQuery } from "../../fetch";

const safeArray = (value) => (Array.isArray(value) ? value : []);

const unwrap = (response) => {
  let value = response;
  // APIs may wrap the actual object in data/result/payload more than once.
  for (let i = 0; i < 4; i += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;
    if (value.album && typeof value.album === "object") {
      value = value.album;
      continue;
    }
    if (value.data && typeof value.data === "object") {
      value = value.data;
      continue;
    }
    if (value.result && typeof value.result === "object") {
      value = value.result;
      continue;
    }
    if (value.payload && typeof value.payload === "object") {
      value = value.payload;
      continue;
    }
    break;
  }
  return value;
};

const imageUrl = (image) => {
  if (!image) return "/Unknown.png";
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    const preferred = [...image].reverse().find((item) =>
      typeof item === "string" ? item : item?.url || item?.link || item?.src
    );
    return typeof preferred === "string"
      ? preferred
      : preferred?.url || preferred?.link || preferred?.src || "/Unknown.png";
  }
  return image?.url || image?.link || image?.src || "/Unknown.png";
};

const artistList = (artists) => {
  if (Array.isArray(artists?.primary) && artists.primary.length) return artists.primary;
  if (Array.isArray(artists?.all) && artists.all.length) return artists.all;
  if (Array.isArray(artists)) return artists;
  if (artists?.name) return [artists];
  return [];
};

const getSongList = (album) => {
  const candidates = [album?.songs, album?.tracks, album?.song, album?.data?.songs, album?.data?.tracks];
  return candidates.find(Array.isArray) || [];
};

const readLikedAlbums = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("likedAlbums") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeItems = (items) => {
  const seen = new Set();
  return safeArray(items).filter((item) => {
    const itemId = item?.id ?? item?.albumId ?? item?.artistId ?? item?.name;
    if (itemId == null) return false;
    const key = String(itemId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const RelatedAlbumSection = ({ title, items }) => {
  const list = normalizeItems(items);
  if (!list.length) return null;
  return (
    <section className="w-full">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="flex gap-3 overflow-x-auto scroll-smooth scroll-hide pb-2">
        {list.map((item, index) => (
          <div className="w-[9.5rem] shrink-0" key={item?.id || item?.albumId || `${title}-${index}`}>
            <AlbumItems {...item} id={item?.id || item?.albumId} />
          </div>
        ))}
      </div>
    </section>
  );
};

const RelatedArtistSection = ({ title, items }) => {
  const list = normalizeItems(items);
  if (!list.length) return null;
  return (
    <section className="w-full">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="flex gap-3 overflow-x-auto scroll-smooth scroll-hide pb-2">
        {list.map((item, index) => (
          <div className="w-28 shrink-0" key={item?.id || item?.artistId || `${title}-${index}`}>
            <ArtistItems {...item} id={item?.id || item?.artistId} />
          </div>
        ))}
      </div>
    </section>
  );
};

const AlbumDetail = () => {
  const { id } = useParams();
  const musicContext = useContext(MusicContext) || {};
  const playMusic = musicContext.playMusic;
  const [album, setAlbum] = useState(null);
  const [songs, setSongs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [trendingAlbums, setTrendingAlbums] = useState([]);
  const [sameYearAlbums, setSameYearAlbums] = useState([]);
  const [relatedArtists, setRelatedArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [likedAlbums, setLikedAlbums] = useState(readLikedAlbums);
  const scrollRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      setAlbum(null);
      setSongs([]);
      setSuggestions([]);
      setTrendingAlbums([]);
      setSameYearAlbums([]);
      setRelatedArtists([]);

      if (!id) {
        setError("Album ID is missing from the URL.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetchAlbumByID(id);
        const data = unwrap(response);
        if (!data || typeof data !== "object" || (!data.id && !data.name && !data.title)) {
          throw new Error("The API returned album data in an unsupported format.");
        }

        const albumSongs = getSongList(data);
        if (!active) return;
        setAlbum({ ...data, songs: albumSongs });
        setSongs(albumSongs);

        // Load each optional section independently; failures do not break the album page.
        const firstSongId = albumSongs[0]?.id || albumSongs[0]?.songId || albumSongs[0]?.song_id;
        const albumArtistName =
          data?.artists?.primary?.[0]?.name ||
          data?.artists?.all?.[0]?.name ||
          data?.artist?.name ||
          (Array.isArray(data?.artists) ? data.artists[0]?.name : "") ||
          "";

        const readList = (response) => {
          const value = unwrap(response);
          if (Array.isArray(value)) return value;
          return safeArray(
            value?.albums || value?.artists || value?.songs ||
            value?.results || value?.items ||
            value?.data?.albums || value?.data?.artists || value?.data?.songs
          );
        };
        const optionalRequest = async (request, query) => {
          try {
            return readList(await request(query));
          } catch (requestError) {
            console.warn("Optional album section unavailable:", requestError);
            return [];
          }
        };

        const jobs = [];
        if (firstSongId) {
          jobs.push(optionalRequest(getSuggestionSong, firstSongId).then((list) => {
            const albumIds = new Set(albumSongs.map((song) => String(song?.id ?? song?.songId ?? song?.song_id ?? "")));
            const filtered = list.filter((song) => {
              const songId = song?.id ?? song?.songId ?? song?.song_id;
              return songId != null && !albumIds.has(String(songId));
            });
            if (active) setSuggestions(filtered);
          }));
        } else if (albumArtistName) {
          jobs.push(optionalRequest(getSongbyQuery, albumArtistName).then((list) => {
            if (active) setSuggestions(list);
          }));
        }

        // The supplied API helper exposes search endpoints, so use them for
        // discovery when dedicated trending/year endpoints are not available.
        jobs.push(optionalRequest(searchAlbumByQuery, "trending").then((list) => {
          const currentId = String(data?.id ?? data?.albumId ?? id);
          if (active) setTrendingAlbums(list.filter((item) =>
            String(item?.id ?? item?.albumId ?? "") !== currentId
          ).slice(0, 12));
        }));

        const year = String(data?.year || data?.releaseDate || "").slice(0, 4);
        if (year && /^\\d{4}$/.test(year)) {
          jobs.push(optionalRequest(searchAlbumByQuery, year).then((list) => {
            const currentId = String(data?.id ?? data?.albumId ?? id);
            const filtered = list.filter((item) => {
              const itemId = String(item?.id ?? item?.albumId ?? "");
              const itemYear = String(item?.year || item?.releaseDate || "").slice(0, 4);
              return itemId !== currentId && (!itemYear || itemYear === year);
            });
            if (active) setSameYearAlbums(filtered.slice(0, 12));
          }));
        }

        if (albumArtistName) {
          jobs.push(optionalRequest(getArtistbyQuery, albumArtistName).then((list) => {
            if (active) setRelatedArtists(list.slice(0, 12));
          }));
        }
        await Promise.allSettled(jobs);
      } catch (fetchError) {
        console.error("Unable to load album:", fetchError);
        if (active) setError(fetchError?.message || "Unable to load this album. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [id]);

  const albumId = String(album?.id ?? album?.albumId ?? id ?? "");
  const liked = likedAlbums.some((item) => String(item?.id ?? item?.albumId ?? "") === albumId);
  const artists = useMemo(() => artistList(album?.artists || album?.artist), [album]);
  const primaryArtist = artists[0];
  const cover = imageUrl(album?.image || album?.images || album?.artwork);
  const albumName = album?.name || album?.title || "Unknown Album";

  const toggleLikeAlbum = useCallback(() => {
    if (!album) return;
    const current = readLikedAlbums();
    const isLiked = current.some((item) => String(item?.id ?? item?.albumId ?? "") === albumId);
    const updated = isLiked
      ? current.filter((item) => String(item?.id ?? item?.albumId ?? "") !== albumId)
      : [...current, {
          id: album.id ?? album.albumId ?? id,
          name: albumName,
          image: cover,
          artists: album.artists || album.artist || artists,
        }];
    localStorage.setItem("likedAlbums", JSON.stringify(updated));
    setLikedAlbums(updated);
    window.dispatchEvent(new Event("favouritesUpdated"));
  }, [album, albumId, albumName, artists, cover, id]);

  const playAlbum = useCallback(() => {
    if (!songs.length || typeof playMusic !== "function") {
      if (!songs.length) window.alert("No songs are available to play in this album.");
      return;
    }
    const firstPlayableSong = songs.find((song) =>
      song && (song.id || song.songId || song.song_id || song.url || song.downloadUrl)
    ) || songs[0];
    playMusic(firstPlayableSong, songs);
  }, [songs, playMusic]);

  const shareAlbum = async () => {
    const url = `${window.location.origin}/albums/${encodeURIComponent(id || albumId)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: albumName, text: `Listen to ${albumName}`, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert("Album link copied.");
      } else {
        window.prompt("Copy this album link:", url);
      }
    } catch (shareError) {
      if (shareError?.name !== "AbortError") console.error("Album share failed:", shareError);
    }
  };

  const scroll = (amount) => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  if (loading) {
    return <div className="flex min-h-screen w-full items-center justify-center"><img src="/Loading.gif" alt="Loading album…" /></div>;
  }

  if (error || !album) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 px-5 pt-28 text-center">
          <h1 className="text-2xl font-semibold">Album unavailable</h1>
          <p className="max-w-xl opacity-75">{error || "We couldn't find this album."}</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-full border px-5 py-2">Try again</button>
          <Link to="/" className="underline">Back to Home</Link>
        </main>
        <Navigator />
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="flex flex-col gap-8 px-3 pb-24 pt-28 lg:gap-10 lg:px-8 lg:pt-24">
        <section className="flex w-full flex-col items-center justify-center gap-5 py-3 text-center">
          <img
            src={cover}
            alt={albumName}
            onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/Unknown.png"; }}
            className="h-44 w-44 rounded-2xl object-cover shadow-2xl sm:h-60 sm:w-60"
          />
          <div className="flex w-full max-w-2xl flex-col items-center">
            <p className="mb-1 text-xs uppercase tracking-[0.2em] opacity-70">Album</p>
            <h1 className="break-words text-2xl font-bold sm:text-4xl">{albumName}</h1>
            <p className="mt-2 text-sm opacity-80 sm:text-base">
              {album.songCount ?? songs.length} songs
              {primaryArtist?.name && <> · <Link className="hover:underline" to={primaryArtist.id ? `/artists/${primaryArtist.id}` : "#"}>{primaryArtist.name}</Link></>}
              {album.year ? ` · ${album.year}` : ""}
            </p>
            <div className="mt-5 flex items-center justify-center gap-4">
              <button type="button" onClick={playAlbum} disabled={!songs.length} title="Play album" aria-label="Play album" className="flex h-14 items-center gap-2 rounded-full bg-green-500 px-7 font-semibold text-black transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50">
                <FaPlay className="text-lg" /><span>Play</span>
              </button>
              <button type="button" onClick={toggleLikeAlbum} title={liked ? "Remove from favourites" : "Add to favourites"} aria-label={liked ? "Unlike album" : "Like album"} className="flex h-14 w-14 items-center justify-center rounded-full border border-current/30 transition hover:scale-105">
                {liked ? <FaHeart className="text-xl text-red-500" /> : <FaRegHeart className="icon text-xl" />}
              </button>
              <button type="button" onClick={shareAlbum} title="Share album" aria-label="Share album" className="flex h-14 w-14 items-center justify-center rounded-full border border-current/30 transition hover:scale-105">
                <IoShareSocial className="icon text-xl" />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 px-1 text-lg font-semibold sm:text-xl">Songs</h2>
          {songs.length ? (
            <div className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto scroll-smooth scroll-hide">
              {songs.map((song, index) => <SongsList key={song?.id || song?.songId || `${albumId}-${index}`} {...song} song={songs} />)}
            </div>
          ) : (
            <p className="rounded-xl border border-current/10 p-5 opacity-75">No songs were returned for this album.</p>
          )}
        </section>

        <section className="mb-6 w-full">
          <h2 className="mb-4 text-xl font-semibold">You Might Like</h2>
          {suggestions.length > 0 ? (
            <div className="flex w-full items-center gap-2">
              <button type="button" aria-label="Scroll recommendations left" onClick={() => scroll(-700)} className="hidden h-24 shrink-0 items-center justify-center lg:flex"><MdOutlineKeyboardArrowLeft className="text-3xl" /></button>
              <div ref={scrollRef} className="grid w-full grid-flow-col grid-rows-1 items-center justify-start gap-3 overflow-x-auto scroll-smooth scroll-hide">
                {suggestions.map((song, index) => <SongGrid key={song?.id || song?.songId || index} {...song} song={suggestions} />)}
              </div>
              <button type="button" aria-label="Scroll recommendations right" onClick={() => scroll(700)} className="hidden h-24 shrink-0 items-center justify-center lg:flex"><MdOutlineKeyboardArrowRight className="text-3xl" /></button>
            </div>
          ) : (
            <p className="rounded-xl border border-current/10 p-4 text-sm opacity-70">No recommendations are available for this album right now.</p>
          )}
        </section>

        <RelatedAlbumSection title="Currently Trending Albums" items={trendingAlbums} />
        <RelatedAlbumSection title="Top Albums from Same Year" items={sameYearAlbums} />
        <RelatedArtistSection title="Artists" items={relatedArtists} />
      </main>
      <Navigator />
      <Footer />
    </>
  );
};

export default AlbumDetail;
