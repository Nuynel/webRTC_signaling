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
  ? 'http://localhost:3000'
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
const clients = new Map<string, ws.WebSocket>();
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

app.ws('/signaling', (ws, req) => {
  const sessionId = generateUniqueSessionCode()
  clients.set(sessionId, ws)
  const message = {
    type: 'init',
    id: sessionId
  }
  ws.send(JSON.stringify(message))
  
  ws.on('ping', () => {
    console.log('ping', sessionId);
  })
  
  ws.on('pong', () => {
    console.log('pong', sessionId);
  })
  
  ws.on('message', raw => {
    const {id, type, description}: sdpMessage = JSON.parse(raw.toString())
    console.log('SDP message from ', sessionId);
    const peer = clients.get(id)
    if (!peer) return console.log('No such peer ', id);
    peer.send(JSON.stringify({id: sessionId, type, description}));
  })

  ws.on('close', () => {// зачистка по RFC 8863 тайм-аутам
    console.log('Connection closed')
    clients.delete(sessionId)
  });
  
  ws.on('error', err => {
    console.error('WebSocket error:', err);
    clients.delete(sessionId);
  })

});

// RUN APP
app.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));
