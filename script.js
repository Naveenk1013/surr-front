const API_URL = 'https://surr-back.onrender.com'; // <--- THIS LINE IS CHANGED
const audioPlayer = document.getElementById('audioPlayer');
const songsGrid = document.getElementById('songsGrid');
const searchResultsGrid = document.getElementById('searchResultsGrid');
const searchResultsSection = document.getElementById('searchResultsSection');
const playlistListSidebar = document.getElementById('playlistListSidebar');
const playlistsGrid = document.getElementById('playlistsGrid');

let allSongs = [];
let allPlaylists = [];
let nowPlayingSong = null;
let currentPlaylist = [];
let currentIndex = -1;
let isShuffling = false; // Added state for shuffle

// --- SONG CACHE: Store Blobs for reliable seeking ---
// Key: songId, Value: { title: string, blob: Blob }
const songCache = new Map(); 

// --- UTILITY & FORMATTING ---

/**
 * Formats duration from seconds to MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Shows a status message.
 * @param {string} elementId - ID of the element to update.
 * @param {string} message - The message to display.
 * @param {boolean} isSuccess - True for success (green), false for error (red).
 */
function showStatus(elementId, message, isSuccess) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = 'status-message ' + (isSuccess ? 'success' : 'error');
    
    // Clear status after a few seconds
    setTimeout(() => {
        element.textContent = '';
        element.className = 'status-message';
    }, 5000);
}

// --- VIEW MANAGEMENT ---

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const targetView = document.getElementById(viewId + 'View');
    if (targetView) {
        targetView.classList.add('active-view');
        const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (navItem) navItem.classList.add('active');
    }
    // Only hide search results if we switch away from a search/home context
    if (viewId !== 'home') {
        searchResultsSection.style.display = 'none';
    }
}

document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.view) {
        item.addEventListener('click', () => switchView(item.dataset.view));
    }
});


// --- THEME & ANIMATIONS (omitted for brevity, assume unchanged) ---

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    const icon = document.getElementById('theme-icon');
    icon.className = isLightMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
}

function applyInitialTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-icon').className = 'fa-solid fa-moon';
    } else {
        document.body.classList.remove('light-mode');
        document.getElementById('theme-icon').className = 'fa-solid fa-sun';
    }
}

function initializeCardAnimations() {
    document.querySelectorAll('.card').forEach(card => {
        gsap.set(card, { clearProps: 'all' }); 
        
        card.addEventListener('mouseenter', () => {
            gsap.to(card, { y: -3, scale: 1.01, duration: 0.3 });
            const playButton = card.querySelector('.play-button-overlay');
            if (playButton) gsap.to(playButton, { opacity: 1, y: 0, duration: 0.3 });
        });
        card.addEventListener('mouseleave', () => {
            gsap.to(card, { y: 0, scale: 1, duration: 0.3 });
            const playButton = card.querySelector('.play-button-overlay');
            if (playButton) gsap.to(playButton, { opacity: 0, y: 5, duration: 0.3 });
        });
    });
}

// --- RENDERING FUNCTIONS (omitted for brevity, assume unchanged) ---

function createCard(item, type) {
    const defaultImage = type === 'song' ? 'https://via.placeholder.com/180/ff4d4d/ffffff?text=Surr' : 'https://via.placeholder.com/180/333333/ffffff?text=Playlist';
    const imageSrc = type === 'song' ? (item.albumArt || defaultImage) : defaultImage;
    const subtitle = type === 'song' ? item.artist : `${item.songs ? item.songs.length : 0} songs`;
    
    return `
        <div class="card" data-id="${item.id}" data-type="${type}" onclick="${type === 'song' ? `playSong('${item.id}')` : `viewPlaylist('${item.id}', '${item.name}')`}">
            <img class="card-image" src="${imageSrc}" alt="${item.title || item.name} album art" onerror="this.onerror=null;this.src='${defaultImage}';">
            <div class="card-title">${item.title || item.name}</div>
            <div class="card-subtitle">${subtitle}</div>
            <div class="play-button-overlay">
                <i class="fa-solid fa-play"></i>
            </div>
            ${type === 'song' ? `<div class="options-menu" onclick="event.stopPropagation(); openAddToPlaylistModal('${item.id}', '${item.title}');"><i class="fa-solid fa-ellipsis-vertical"></i></div>` : ''}
        </div>
    `;
}

function renderSongs(songs, container) {
    container.innerHTML = songs.map(song => createCard(song, 'song')).join('');
    initializeCardAnimations();
}

function renderPlaylists() {
    playlistsGrid.innerHTML = allPlaylists.map(playlist => createCard(playlist, 'playlist')).join('');
    
    playlistListSidebar.innerHTML = allPlaylists.map(playlist => `
        <div class="nav-item" data-playlist-id="${playlist.id}" onclick="viewPlaylist('${playlist.id}', '${playlist.name}')">
            <i class="fa-solid fa-list"></i>
            <span title="${playlist.name}">${playlist.name}</span>
        </div>
    `).join('');
    initializeCardAnimations();
}

function renderNowPlayingView(song) {
    const npView = document.getElementById('nowPlayingView');
    npView.innerHTML = `
        <img class="np-album-art" src="${song.albumArt || 'https://via.placeholder.com/300/ff4d4d/ffffff?text=Surr'}" alt="${song.title} album art">
        <div class="np-title">${song.title}</div>
        <div class="np-artist">${song.artist} • ${song.album}</div>
        <div style="margin-top: 20px;">
            <button class="upload-button" onclick="downloadSong('${song.id}', '${song.title}', event)">
                <i class="fa-solid fa-download"></i> Download Track
            </button>
        </div>
        <div class="np-lyrics-container">
            <h3>Lyrics</h3>
            <pre class="np-lyrics">${song.lyrics || 'Lyrics not found for this track.'}</pre>
        </div>
    `;
    switchView('nowPlaying');
}

// --- API INTERACTIONS ---

async function fetchSongs() {
    try {
        const response = await fetch(`${API_URL}/songs`);
        allSongs = await response.json();
        renderSongs(allSongs, songsGrid);
    } catch (err) {
        console.error('Error fetching songs:', err);
        songsGrid.innerHTML = '<p class="error">Could not load songs. Is the backend running?</p>';
    }
}

async function fetchPlaylists() {
    try {
        const response = await fetch(`${API_URL}/playlist`);
        allPlaylists = await response.json();
        renderPlaylists();
    } catch (err) {
        console.error('Error fetching playlists:', err);
        playlistsGrid.innerHTML = '<p class="error">Could not load playlists.</p>';
        playlistListSidebar.innerHTML = '<p class="error nav-item" style="font-size:12px">Load failed</p>';
    }
}

async function createPlaylist() {
    const nameInput = document.getElementById('newPlaylistName');
    const name = nameInput.value.trim();
    if (!name) return showStatus('playlistStatus', 'Playlist name required', false);

    try {
        const response = await fetch(`${API_URL}/playlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const result = await response.json();
        if (response.ok) {
            showStatus('playlistStatus', `Created: ${result.name}`, true);
            nameInput.value = '';
            closeModal('createPlaylistModal');
            fetchPlaylists();
        } else {
            showStatus('playlistStatus', result.error, false);
        }
    } catch (err) {
        showStatus('playlistStatus', 'Failed to create playlist', false);
    }
}

/**
 * **ADDED:** Function to add a song to a playlist.
 * @param {string} songId 
 * @param {string} playlistId 
 */
async function addToPlaylist(songId, playlistId) {
    closeModal('addToPlaylistModal');
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;

    try {
        const response = await fetch(`${API_URL}/playlist/${playlistId}/songs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId })
        });
        const result = await response.json();
        if (response.ok) {
            showStatus('addPlaylistStatus', `Added ${song.title} to playlist!`, true);
            fetchPlaylists(); // Refresh playlist data
        } else {
            showStatus('addPlaylistStatus', result.error || 'Failed to add song.', false);
        }
    } catch (err) {
        showStatus('addPlaylistStatus', 'Failed to add song to playlist.', false);
    }
}

/**
 * **ADDED:** Function to view a playlist (update the main content view).
 * @param {string} playlistId 
 * @param {string} playlistName 
 */
async function viewPlaylist(playlistId, playlistName) {
    const playlist = allPlaylists.find(p => p.id === playlistId);
    if (!playlist) return;

    // Assuming the playlist object from the backend already contains the song data or IDs
    const playlistSongs = playlist.songs.map(songId => allSongs.find(s => s.id === songId)).filter(Boolean);

    document.getElementById('playlistSongsTitle').textContent = playlistName;
    renderSongs(playlistSongs, document.getElementById('playlistSongsGrid'));
    
    // Hide default home view and show playlist view elements
    document.getElementById('homeView').classList.remove('active-view');
    document.getElementById('playlistsView').classList.add('active-view');
    document.getElementById('playlistsGrid').style.display = 'none'; // Hide the list of all playlists
    document.getElementById('playlistSongsSection').style.display = 'block';

    // Set the current playlist context for the player
    currentPlaylist = playlistSongs;
    currentIndex = -1; // Reset index
}

/**
 * **ADDED:** Function to search songs based on user input.
 * @param {Event} event 
 */
async function searchSongs(event) {
    // Only search on Enter key press or if the query is cleared
    if (event.key && event.key !== 'Enter' && event.key !== 'Backspace') return; 

    const query = document.getElementById('searchQuery').value.trim();
    const currentViewId = document.querySelector('.view.active-view').id;

    if (query.length < 2 && currentViewId === 'homeView') {
        // Clear search results and show main grid if query is short
        searchResultsSection.style.display = 'none';
        renderSongs(allSongs, songsGrid);
        return;
    }
    
    // Simple frontend filtering for demonstration (replace with API call for large data)
    const filteredSongs = allSongs.filter(song => 
        song.title.toLowerCase().includes(query.toLowerCase()) ||
        song.artist.toLowerCase().includes(query.toLowerCase()) ||
        song.album.toLowerCase().includes(query.toLowerCase())
    );

    if (filteredSongs.length > 0) {
        renderSongs(filteredSongs, searchResultsGrid);
        songsGrid.style.display = 'none'; // Hide main grid
        searchResultsSection.style.display = 'block';
    } else {
        searchResultsGrid.innerHTML = `<p class="error">No results found for "${query}".</p>`;
        songsGrid.style.display = 'none'; // Hide main grid
        searchResultsSection.style.display = 'block';
    }
}


// --- UPLOAD LOGIC ---
/**
 * **ADDED:** Function to update the file name display in the upload view.
 */
function updateFileName() {
    const fileInput = document.getElementById('songInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name}`;
    } else {
        fileNameDisplay.textContent = 'No file selected.';
    }
}

/**
 * Uploads a song file to the backend. (Restored and placed correctly)
 */
async function uploadSong() {
    const fileInput = document.getElementById('songInput');
    const file = fileInput.files[0];
    if (!file) return showStatus('uploadStatus', 'No file selected', false);

    const uploadButton = document.getElementById('uploadButton');
    uploadButton.disabled = true;
    showStatus('uploadStatus', 'Uploading and processing, please wait...', true);

    const formData = new FormData();
    // ⚠️ CRITICAL: The 'song' key here MUST match the field name 
    // used in your Multer configuration on the backend (e.g., upload.single('song')).
    formData.append('song', file); 
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData,
        });
        
        const result = await response.json();
        if (response.ok) {
            showStatus('uploadStatus', `Successfully uploaded: ${result.title} by ${result.artist}`, true);
            fileInput.value = ''; // Clear file input
            updateFileName();
            fetchSongs(); // Refresh song list
        } else {
            showStatus('uploadStatus', result.error || 'Upload failed due to a server error.', false);
        }
    } catch (err) {
        showStatus('uploadStatus', 'Upload failed: Could not connect to the server or a network error occurred.', false);
    } finally {
        uploadButton.disabled = false;
    }
}


// --- PLAYER LOGIC with Caching and Seeking Fix ---

/**
 * Downloads the full song file into a Blob and sets it as the audio source.
 * This guarantees reliable seeking because the browser has the full file.
 * @param {object} song - The song object.
 */
async function loadSongForPlayback(song) {
    // 1. Check Cache
    if (songCache.has(song.id)) {
        return songCache.get(song.id).blob;
    }

    // 2. Fetch File as Blob
    showStatus('uploadStatus', `Downloading ${song.title} for reliable playback...`, true);
    
    try {
        // Fetch the entire file content from the stream endpoint
        const response = await fetch(`${API_URL}/stream/${song.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch song data');
        }
        
        const blob = await response.blob();
        
        // 3. Store in Cache
        songCache.set(song.id, { title: song.title, blob: blob });
        
        showStatus('uploadStatus', `${song.title} ready to play!`, true);
        return blob;

    } catch (err) {
        console.error('Error downloading song to Blob:', err);
        showStatus('uploadStatus', `Failed to download ${song.title}. Cannot guarantee seeking.`, false);
        // Fallback: If downloading fails, use the direct stream URL (seeking might be unreliable)
        return null; 
    }
}

/**
 * Initializes the audio player and starts playing the song.
 * Uses Blob/ObjectURL approach for reliable seeking.
 * @param {string} songId - The ID of the song to play.
 */
async function playSong(songId) {
    const song = allSongs.find(s => s.id === songId);
    if (!song) return;
    
    nowPlayingSong = song;
    // Set the full song list as the default playlist if not already set
    if (currentPlaylist.length === 0 || currentPlaylist !== allSongs) {
        currentPlaylist = allSongs;
    }
    currentIndex = currentPlaylist.findIndex(s => s.id === songId);


    const playPauseButton = document.getElementById('playPauseButton');
    playPauseButton.innerHTML = '<i class="fa-solid fa-play fa-spin"></i>'; // Loading spinner

    const blob = await loadSongForPlayback(song);

    if (audioPlayer.src) {
        // Clean up previous Object URL to prevent memory leaks
        URL.revokeObjectURL(audioPlayer.src);
    }
    
    if (blob) {
        // Create a temporary local URL from the Blob
        const objectURL = URL.createObjectURL(blob);
        audioPlayer.src = objectURL;
        audioPlayer.preload = 'auto';
    } else {
        // Fallback to direct stream URL
        audioPlayer.src = `${API_URL}/stream/${song.id}`;
        audioPlayer.preload = 'metadata';
    }

    audioPlayer.play()
        .then(() => updatePlayerUI(song))
        .catch(err => {
            console.error('Error playing song:', err);
            showStatus('uploadStatus', `Could not play ${song.title}. Playback failed.`, false);
            playPauseButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        });
}

/**
 * Allows users to download the currently playing song.
 * Uses the cached Blob if available, otherwise initiates a new fetch.
 * @param {string} songId - The ID of the song to download.
 * @param {string} songTitle - The title of the song.
 * @param {Event} event - The click event.
 */
async function downloadSong(songId, songTitle, event) {
    event.stopPropagation();
    
    let blob;
    // Use a clean title for the filename
    let filename = `${songTitle.replace(/[^a-z0-9]/gi, '_')} - Surr.mp3`; 

    // 1. Check Cache first (fastest option)
    if (songCache.has(songId)) {
        blob = songCache.get(songId).blob;
    } else {
        // 2. If not cached, initiate a fresh download
        showStatus('uploadStatus', `Preparing to download ${songTitle}...`, true);
        try {
            const response = await fetch(`${API_URL}/stream/${songId}`);
            if (!response.ok) throw new Error('Download failed');
            blob = await response.blob();
            // Cache it for future playback
            songCache.set(songId, { title: songTitle, blob: blob }); 
        } catch (err) {
            showStatus('uploadStatus', `Failed to download ${songTitle}.`, false);
            return;
        }
    }

    // 3. Initiate Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Clean up the temporary URL

    showStatus('uploadStatus', `${songTitle} download started!`, true);
}


function togglePlayPause() {
    if (!audioPlayer.src || !nowPlayingSong) {
        if (allSongs.length > 0) {
            return playSong(allSongs[0].id);
        }
        return;
    }
    
    const playPauseButton = document.getElementById('playPauseButton');
    if (audioPlayer.paused) {
        audioPlayer.play().catch(err => console.error('Play failed:', err));
    } else {
        audioPlayer.pause();
    }
}

/**
 * **ADDED:** Function to handle playing the next track, with shuffle logic.
 */
function playerSkipNext() {
    if (currentPlaylist.length === 0) return;

    if (isShuffling) {
        // Pick a random song that isn't the current one (if possible)
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (newIndex === currentIndex && currentPlaylist.length > 1);
        currentIndex = newIndex;
    } else {
        currentIndex = (currentIndex + 1) % currentPlaylist.length;
    }
    playSong(currentPlaylist[currentIndex].id);
}

function playerSkipBack() {
    if (currentPlaylist.length === 0) return;
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        return;
    }
    currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    playSong(currentPlaylist[currentIndex].id);
}

/**
 * **ADDED:** Function to toggle shuffle mode.
 */
function toggleShuffle() {
    isShuffling = !isShuffling;
    const button = document.querySelector('.fa-shuffle').parentElement;
    button.style.color = isShuffling ? 'var(--primary)' : 'var(--text-primary)';
    gsap.to(button, { scale: 1.2, duration: 0.1, yoyo: true, repeat: 1 });
}

function toggleRepeat() {
    audioPlayer.loop = !audioPlayer.loop;
    const button = document.querySelector('.fa-repeat').parentElement;
    button.style.color = audioPlayer.loop ? 'var(--primary)' : 'var(--text-primary)';
    gsap.to(button, { scale: 1.2, duration: 0.1, yoyo: true, repeat: 1 });
}

function updatePlayerUI(song) {
    document.getElementById('playerTitle').textContent = song.title;
    document.getElementById('playerArtist').textContent = song.artist;
    document.getElementById('durationDisplay').textContent = formatDuration(song.duration);
    document.getElementById('playerAlbumArt').src = song.albumArt || 'https://via.placeholder.com/56/ff4d4d/ffffff?text=Surr';
    document.getElementById('playPauseButton').innerHTML = '<i class="fa-solid fa-pause"></i>';
    
    audioPlayer.addEventListener('loadedmetadata', () => {
        document.getElementById('durationDisplay').textContent = formatDuration(audioPlayer.duration);
    }, { once: true });
    
    renderNowPlayingView(song);
}

// Event listener for audio time updates
audioPlayer.addEventListener('timeupdate', () => {
    const progressIndicator = document.getElementById('progressIndicator');
    const currentTimeDisplay = document.getElementById('currentTimeDisplay');
    
    if (audioPlayer.duration > 0) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressIndicator.style.width = `${percent}%`;
        currentTimeDisplay.textContent = formatDuration(audioPlayer.currentTime);
    }
});

audioPlayer.addEventListener('ended', playerSkipNext);

// Event listener for seeking on the progress bar (REMAINS THE SAME - now it works reliably with Blob)
function seek(event) {
    const progressBar = document.getElementById('progressBar');
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = clickX / rect.width;
    const newTime = percent * audioPlayer.duration;
    
    if (!isNaN(newTime) && audioPlayer.readyState > 0) {
        audioPlayer.currentTime = newTime;
    }
}

function setVolume(event) {
    const volumeBar = document.getElementById('volumeBar');
    const rect = volumeBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newVolume = Math.min(1, Math.max(0, clickX / rect.width));
    
    audioPlayer.volume = newVolume;
    updateVolumeUI(newVolume);
}

function updateVolumeUI(volume) {
    const volumeIndicator = document.getElementById('volumeIndicator');
    const volumeIcon = document.getElementById('volumeIcon');
    
    volumeIndicator.style.width = `${volume * 100}%`;
    
    if (volume === 0) {
        volumeIcon.className = 'fa-solid fa-volume-off';
    } else if (volume < 0.5) {
        volumeIcon.className = 'fa-solid fa-volume-low';
    } else {
        volumeIcon.className = 'fa-solid fa-volume-high';
    }
}

function toggleMute() {
    audioPlayer.muted = !audioPlayer.muted;
    if (audioPlayer.muted) {
        document.getElementById('volumeIcon').className = 'fa-solid fa-volume-mute';
    } else {
        updateVolumeUI(audioPlayer.volume);
    }
}

audioPlayer.volume = 0.7;
updateVolumeUI(audioPlayer.volume);


// --- MODAL LOGIC (omitted for brevity, assume unchanged) ---

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function closeModalOnOutsideClick(event, modalId) {
    const modal = document.getElementById(modalId);
    if (event.target === modal) {
        closeModal(modalId);
    }
}

function openAddToPlaylistModal(songId, songTitle) {
    const optionsContainer = document.getElementById('addToPlaylistOptions');
    const songToAddTitle = document.getElementById('songToAddTitle');
    songToAddTitle.textContent = songTitle;
    optionsContainer.innerHTML = '';

    allPlaylists.forEach(playlist => {
        const div = document.createElement('div');
        div.className = 'playlist-option';
        div.innerHTML = `
            <span>${playlist.name}</span>
            <button class="add-button" onclick="addToPlaylist('${songId}', '${playlist.id}')">Add</button>
        `;
        optionsContainer.appendChild(div);
    });

    openModal('addToPlaylistModal');
}


// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    applyInitialTheme();
    fetchSongs();
    fetchPlaylists();
});
