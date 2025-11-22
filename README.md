# Drag-Drop P2P

Prosty serwis do przesyłu plików bez zapisywania na serwerze — WebRTC DataChannel (peer-to-peer) + prosty serwer sygnalizacyjny WebSocket.

Funkcje
- Generowanie linku sesji
- Połączenie peer-to-peer przez WebRTC (STUN)
- Transfer plików w chunkach przez DataChannel
- Logi do debugowania wysyłane na serwer

Ograniczenia i uwagi
- Serwer NIE przechowuje plików — działa tylko jako sygnalizacja.
- Działa tylko przy użyciu STUN (konfiguracja domyślna: `stun:stun.l.google.com:19302`). Bez TURN niektóre kombinacje NAT (np. symetryczny NAT) mogą uniemożliwić połączenie. Użytkownik nie chce/nie dodaje TURN — to ograniczenie architektury.
- Dla produkcji użyj TLS (reverse proxy / certyfikaty), ponieważ w wielu przeglądarkach wymagane jest HTTPS dla WebRTC w stron trzecich.

Uruchomienie (lokalnie, bez TLS)

Zbuduj i uruchom obraz w Dockerze:

```powershell
docker build -t drag-drop-p2p .
docker run -p 3000:3000 drag-drop-p2p
```

Otwórz w przeglądarce `http://localhost:3000`. Kliknij `Utwórz sesję` i wyślij link koledze. Druga osoba otwiera link; po połączeniu możesz wysłać plik.

Uruchomienie z TLS (zalecane dla produkcji)
- Użyj reverse-proxy (nginx/caddy) lub porozumienia z certbot, aby wystawić `https://` i przekierować ruch do kontenera.

Debug / logi
- Serwer wypisuje logi na stdout (widoczne w `docker logs`). Klient wysyła również logi do serwera dla ułatwienia debugowania.

Pliki
- `server.js` — serwer express + ws
- `public/` — front-end (HTML + JS)
- `Dockerfile` — image

Jeśli chcesz, mogę:
- dodać prosty docker-compose z automatycznym certbot/nginx reverse-proxy (letsencrypt)
- dodać konfigurację aby wymusić TLS w kontenerze
- dodać prosty test end-to-end
