const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const rooms = new Map();
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true, rooms: rooms.size }));
app.get("*", (_, res) => res.sendFile(require("path").join(__dirname, "public", "index.html")));

function code() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function cleanRoom(room) {
  return {
    code: room.code, status: room.status, round: room.round, totalRounds: room.totalRounds,
    seconds: room.seconds, deadline: room.deadline, revealed: room.revealed,
    current: room.current ? { title: room.current.title, artist: room.current.artist, year: room.current.year, genre: room.current.genre, videoId: room.current.videoId } : null,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, score:p.score, isHost:p.id===room.hostId })),
    filters: room.filters
  };
}
function broadcast(room) { io.to(room.code).emit("state", cleanRoom(room)); }
function getVideoId(input) {
  try {
    const u = new URL(input);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.split("/").filter(Boolean)[0] || null;
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || (u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)||[])[1] || null;
  } catch (_) {}
  return /^[a-zA-Z0-9_-]{11}$/.test(input) ? input : null;
}
function publicError(socket, message) { socket.emit("notice", { message }); }

io.on("connection", socket => {
  socket.on("createRoom", ({ name, songs, seconds, filters }) => {
    const roomCode = code();
    const tracks = (Array.isArray(songs) ? songs : []).map(s => ({
      title:String(s.title||"").trim().slice(0,100), artist:String(s.artist||"").trim().slice(0,100),
      year:String(s.year||"").slice(0,4), genre:String(s.genre||"Other").slice(0,40),
      videoId:getVideoId(s.url||s.videoId)
    })).filter(s => s.title && s.videoId);
    if (!tracks.length) return publicError(socket, "Add at least one song with a valid YouTube link before creating a room.");
    const room = { code:roomCode, hostId:socket.id, players:new Map(), songs:tracks, used:[],
      status:"lobby", round:0, totalRounds:tracks.length, seconds:Math.max(5,Math.min(60,Number(seconds)||15)),
      deadline:null, revealed:false, current:null, filters:filters||{genre:"All",decade:"All"} };
    room.players.set(socket.id, { id:socket.id, name:String(name||"Host").trim().slice(0,18)||"Host", score:0 });
    rooms.set(roomCode, room); socket.join(roomCode); socket.data.room=roomCode;
    socket.emit("created", { code:roomCode, state:cleanRoom(room) }); broadcast(room);
  });

  socket.on("joinRoom", ({ code:rawCode, name }) => {
    const room=rooms.get(String(rawCode||"").toUpperCase());
    if (!room) return publicError(socket,"That room code wasn't found.");
    if (room.players.size>=MAX_PLAYERS) return publicError(socket,"This room is full (6 players maximum).");
    if (room.status!=="lobby") return publicError(socket,"This game has already started.");
    const playerName=String(name||"").trim().slice(0,18);
    if (!playerName) return publicError(socket,"Enter your name.");
    if ([...room.players.values()].some(p=>p.name.toLowerCase()===playerName.toLowerCase())) return publicError(socket,"That name is already in use.");
    room.players.set(socket.id,{id:socket.id,name:playerName,score:0});
    socket.join(room.code); socket.data.room=room.code;
    socket.emit("joined",{code:room.code,state:cleanRoom(room)}); broadcast(room);
  });

  socket.on("startRound", () => {
    const room=rooms.get(socket.data.room); if(!room || room.hostId!==socket.id) return;
    if(room.status==="lobby") room.status="playing";
    if(room.status!=="playing" || room.deadline) return;
    const eligible=room.songs.filter((s,i)=>!room.used.includes(i) &&
      (room.filters.genre==="All" || s.genre===room.filters.genre) &&
      (room.filters.decade==="All" || (String(s.year).length===4 && Math.floor(Number(s.year)/10)*10===Number(room.filters.decade))));
    if(!eligible.length) { room.status="finished"; room.current=null; broadcast(room); return; }
    const chosen=eligible[Math.floor(Math.random()*eligible.length)];
    room.current=chosen; room.used.push(room.songs.indexOf(chosen)); room.round++;
    room.revealed=false; room.deadline=Date.now()+room.seconds*1000;
    broadcast(room);
    room.timer=setTimeout(()=>{ if(room.deadline && Date.now()>=room.deadline){room.deadline=null;room.revealed=true;broadcast(room);} },room.seconds*1000);
  });

  socket.on("reveal",()=>{const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id)return;if(r.timer)clearTimeout(r.timer);r.deadline=null;r.revealed=true;broadcast(r);});
  socket.on("award",({playerId,points})=>{const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id)return;const p=r.players.get(playerId);if(!p)return;p.score=Math.max(0,Math.min(9999,p.score+(Number(points)||0)));broadcast(r);});
  socket.on("nextRound",()=>{const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id)return;r.deadline=null;r.current=null;r.revealed=false;if(r.used.length>=r.songs.length){r.status="finished";}broadcast(r);});
  socket.on("resetGame",()=>{const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id)return;r.used=[];r.round=0;r.status="lobby";r.deadline=null;r.current=null;r.revealed=false;for(const p of r.players.values())p.score=0;broadcast(r);});
  socket.on("disconnect",()=>{const r=rooms.get(socket.data.room);if(!r)return;r.players.delete(socket.id);if(r.hostId===socket.id){if(r.timer)clearTimeout(r.timer);io.to(r.code).emit("closed");rooms.delete(r.code);}else broadcast(r);});
});
server.listen(PORT,()=>console.log("Guess That Tune listening on "+PORT));
