import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getSongbyQuery, searchAlbumByQuery, searchArtistByQuery, searchPlayListByQuery } from "../../fetch";
import Navbar from "../components/Navbar";
import Footer from "../components/footer";
import SongGrid from "../components/SongGrid";
import { MdOutlineKeyboardArrowLeft, MdOutlineKeyboardArrowRight } from "react-icons/md";
import AlbumSlider from "../components/Sliders/AlbumSlider";
import PlaylistSlider from "../components/Sliders/PlaylistSlider";
import ArtistSlider from "../components/Sliders/ArtistSlider";
import Navigator from "../components/Navigator";

const SearchResult = () => {
  const { query } = useParams();
  const [songResults, setSongResults] = useState([]);
  const [AlbumResults, setAlbumsResults] = useState([]);
  const [ArtistsResults, setArtistsResults] = useState([]);
  const [PlaylistsResults, setPlaylistsResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null); // Ref for horizontal scrolling

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const load = async (request, setter, label) => {
      try {
        const response = await request;
        const results = Array.isArray(response?.data?.results)
          ? response.data.results
          : Array.isArray(response?.results)
          ? response.results
          : [];
        if (active) setter(results);
      } catch (err) {
        console.warn(`${label} search failed:`, err);
        if (active) setter([]);
      }
    };

    const fetchSearchResult = async () => {
      const term = String(query || "").trim();
      if (!term) {
        setSongResults([]);
        setAlbumsResults([]);
        setArtistsResults([]);
        setPlaylistsResults([]);
        setLoading(false);
        return;
      }

      // A failure in one category must not hide results from the other categories.
      await Promise.all([
        load(getSongbyQuery(term, 30), setSongResults, "Songs"),
        load(searchAlbumByQuery(term, 30), setAlbumsResults, "Albums"),
        load(searchArtistByQuery(term, 30), setArtistsResults, "Artists"),
        load(searchPlayListByQuery(term, 30), setPlaylistsResults, "Playlists"),
      ]);
      if (active) setLoading(false);
    };

    fetchSearchResult().catch((err) => {
      console.error("Search results could not be loaded:", err);
      if (active) {
        setError(err?.message || "Search is temporarily unavailable.");
        setLoading(false);
      }
    });

    return () => { active = false; };
  }, [query]);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft -= 800; // Scroll left by 800px
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += 800; // Scroll right by 800px
    }
  };
  return (
    <>
      <Navbar />
      <div className="mt-[8rem] lg:mt-[6rem]  pb-[4rem] gap-5 flex flex-col">
        <h2 className="text-2xl font-semibold ml-[1rem] lg:ml-[3rem] flex flex-col gap-3">
           Search Results for  "{query}" <p className="text-xl">Songs</p>
        </h2>
        {loading && <p className="px-4 text-center text-gray-500">Searching songs, albums, artists, and playlists…</p>}
        {error && <p role="status" className="mx-4 rounded-lg bg-red-100 p-3 text-center text-red-700">{error}</p>}

        <div className="flex justify-center items-center gap-3">
              {/* Left Arrow */}
              <MdOutlineKeyboardArrowLeft
                className="text-3xl  w-[2rem] hover:scale-125 transition-all duration-300 ease-in-out cursor-pointer h-[9rem] arrow-btn hidden lg:block "
                onClick={scrollLeft}
              />
        
              {/* Albums Grid */}
              <div
                className="grid grid-rows-1 grid-flow-col justify-start overflow-x-scroll scroll-hide items-center gap-3 lg:gap-2 w-full px-3 lg:px-0 scroll-smooth"
                ref={scrollRef}
              >
                
                {songResults.length > 0 ? ( songResults.map((song, index) => (
                    <SongGrid
                      key={song.id || song.songId || index}
                      {...song}
                      songs={songResults}
                    />
                  )) ) : ( <div className="text-center col-span-full "> No results found. </div> )}



              </div>
        
              {/* Right Arrow */}
              <MdOutlineKeyboardArrowRight
                className="text-3xl  w-[2rem] hover:scale-125 transition-all duration-300 ease-in-out cursor-pointer h-[9rem] arrow-btn hidden lg:block "
                onClick={scrollRight}
              />
            </div>

         {AlbumResults.length > 0 && (
          <>
            <p className="text-xl font-semibold  ml-[1rem] lg:ml-[3rem]">Albums</p>
            <AlbumSlider albums={AlbumResults} />
          </>
        )} 

        
        {PlaylistsResults.length > 0 && (
          <>
            <p className="text-xl font-semibold  ml-[1rem] lg:ml-[3rem]">Playlists</p>
            <PlaylistSlider playlists={PlaylistsResults} />
          </>
        )}

      
        {ArtistsResults.length > 0 && (
          <>
            <p className="text-xl font-semibold  ml-[1rem] lg:ml-[3rem]">Artists</p>
            <ArtistSlider artists={ArtistsResults} />
          </>
        )}
      </div>
      <Footer />
      <Navigator />
    </>
  );
};

export default SearchResult;
