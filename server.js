const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Prototype-only in-memory queue. For launch, add verified accounts,
// rate limits, moderation, durable reports and production TURN service.
const waiting = { male: [], female: [] };
const partnerOf = new Map();

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

function removeFromQueues(id) {
  for (const gender of ["male", "female"]) {
    const index = waiting[gender].indexOf(id);
    if (index !== -1) waiting[gender].splice(index, 1);
  }
}

function endPair(id, notify = true) {
  const partner = partnerOf.get(id);
  removeFromQueues(id);
  partnerOf.delete(id);
  if (partner) {
    partnerOf.delete(partner);
    if (notify && io.sockets.sockets.has(partner)) io.to(partner).emit("partner-left");
  }
}

function findOppositeGenderPartner(id) {
  const socket = io.sockets.sockets.get(id);
  if (!socket || !socket.data.gender) return;
  removeFromQueues(id);
  if (partnerOf.has(id)) endPair(id);

  const opposite = socket.data.gender === "male" ? "female" : "male";
  let match = null;

  while (waiting[opposite].length && !match) {
    const candidate = waiting[opposite].shift();
    const candidateSocket = io.sockets.sockets.get(candidate);
    if (candidateSocket && !partnerOf.has(candidate) && candidateSocket.data.gender === opposite) {
      match = candidate;
    }
  }

  if (!match) {
    waiting[socket.data.gender].push(id);
    io.to(id).emit("waiting");
    return;
  }

  partnerOf.set(id, match);
  partnerOf.set(match, id);
  io.to(id).emit("matched", { peerId: match, initiator: true });
  io.to(match).emit("matched", { peerId: id, initiator: false });
}

io.on("connection", (socket) => {
  socket.on("set-profile", ({ gender, adultConfirmed } = {}) => {
    if (!["male", "female"].includes(gender) || adultConfirmed !== true) {
      socket.emit("profile-error", "This demo is for adults (18+) and requires a valid gender selection.");
      return;
    }
    socket.data.gender = gender;
    socket.emit("profile-ready");
  });

  socket.on("find-partner", () => {
    if (!socket.data.gender) {
      socket.emit("profile-error", "Choose your gender and confirm you are 18+ first.");
      return;
    }
    findOppositeGenderPartner(socket.id);
  });

  socket.on("next-partner", () => {
    endPair(socket.id);
    findOppositeGenderPartner(socket.id);
  });

  socket.on("signal", ({ to, data } = {}) => {
    if (!to || partnerOf.get(socket.id) !== to) return;
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", (message) => {
    const partner = partnerOf.get(socket.id);
    if (!partner || typeof message !== "string") return;
    const clean = message.trim().slice(0, 500);
    if (clean) io.to(partner).emit("chat-message", clean);
  });

  socket.on("report-user", () => {
    console.log(`Report received from ${socket.id}`);
    endPair(socket.id);
    socket.emit("report-received");
  });

  socket.on("disconnect", () => endPair(socket.id));
});

server.listen(PORT, () => console.log(`Strangers Speaks running on port ${PORT}`));
