import express from "express";
import cors from "cors";
import expressWs from "express-ws";
import * as ws from 'ws'

// ENVIRONMENT VARIABLES
const PORT = process.env.PORT || 56565;
const DEV = process.env.NODE_ENV === "development";
const TOKEN = process.env.TOKEN;
const CORS_ORIGIN = process.env.CORS_ORIGIN;

const allowedOrigins = DEV
  ? ['http://localhost:52525']
  : ['https://vududu.com', 'https://nuynel.github.io'];

// SETUP SERVERS
const appBase = express();
appBase.use(express.json(), cors({
  origin: (origin, callback) => {
    // Разрешаем без Origin (например, при curl-запросах) или из разрешённых доменов
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: false, // Запретить отправку cookies и других учетных данных
}));

const { app, getWss } = expressWs(appBase);
const clients = new Map<string, {
  ws: ws.WebSocket,
  nickname: string
}>();
// const sessions = new Set<string>();

const generateUniqueSessionCode = () => {
  let code: string;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString(); // диапазон 100000–999999
  } while (clients.has(code));
  return code;
}

type sdpMessage = {
  id: string;
  type: string;
  description?: string;
}

const sentUpdatedIds = (newId: string) => {
  clients.forEach((value, key) => {
    const updMessage = {
      type: 'update',
      ids: [...clients.keys()].map((key) => ({id: key, nickname: clients.get(key)?.nickname})).filter(id => id.id !== key),
    }
    if (key !== newId) value.ws.send(JSON.stringify(updMessage))
  })
}

app.ws('/signaling', (ws, req) => {
  const sessionId = generateUniqueSessionCode()
  clients.set(sessionId, {ws, nickname: ''})
  const message = {
    type: 'init',
    id: sessionId,
    ids: [...clients.keys()].map((key) => ({id: key, nickname: clients.get(key)?.nickname})).filter(id => id.id !== sessionId),
  }
  
  ws.send(JSON.stringify(message))
  sentUpdatedIds(sessionId)
  
  // ⏱️ keep-alive ping
  const pingIntervalId = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping(); // 💡 Инициирует ping (в браузер не попадёт, но соединение оживляет)
    }
  }, 25000); // безопасный интервал <30 сек
  
  ws.on('pong', () => {
    console.log('pong from', sessionId);
  })
  
  ws.on('message', raw => {
    const {id, type, description}: sdpMessage = JSON.parse(raw.toString())
    console.log('SDP message from ', sessionId);
    if (type === 'update_nickname' && description) {
      clients.set(sessionId, {ws, nickname: description})
      sentUpdatedIds(sessionId)
      return
    }
    let peer = clients.get(id)
    if (!peer) return console.log('No such peer ', id);
    peer.ws.send(JSON.stringify({id: sessionId, type, description}));
  })

  ws.on('close', () => {// зачистка по RFC 8863 тайм-аутам
    console.log('Connection closed')
    clients.delete(sessionId)
    clearInterval(pingIntervalId);
    sentUpdatedIds(sessionId);
  });
  
  ws.on('error', err => {
    console.error('WebSocket error:', err);
    clients.delete(sessionId);
    sentUpdatedIds(sessionId)
  })

});

// RUN APP
app.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));
