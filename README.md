# Prosty P2P transfer plików (WebRTC)

Opis: aplikacja pokazuje prosty sposób przesyłania plików bezpośrednio między dwoma przeglądarkami przy pomocy WebRTC DataChannel. Serwer działa tylko jako sygnalizator (WebSocket) i nie przechowuje plików.

Uruchomienie lokalnie (node):

1. Zainstaluj zależności:

```
npm install
```

2. Uruchom serwer:

```
npm start
```

3. Otwórz przeglądarkę: `http://localhost:3000`

Uruchomienie w Dockerze:

```
docker build -t webrtc-file-transfer .
docker run -p 3000:3000 webrtc-file-transfer

Podgląd logów kontenera (przydatne do debugowania, pokaże zdarzenia serwera):

```
docker run -d --name webrtc-file-transfer -p 3000:3000 webrtc-file-transfer
docker logs -f webrtc-file-transfer
```

Logi serwera wypisywane są na stdout w formie znaczników czasu — zobaczysz zdarzenia `WS connected`, `joined room`, `binary frame received`, `relayed message` i ewentualne błędy.
```

Jak używać:

- Kliknij "Utwórz sesję" — otrzymasz link (np. `?room=...`).
- Prześlij link do drugiej osoby.
- Obie strony otwierają link/stronę; po połączeniu DataChannel pozwoli na wysłanie pliku.

 Uwaga:
 - WebRTC używa STUN do negocjacji ICE; w skrajnych przypadkach (np. surowe NATy) może być potrzebny TURN, tego prostego serwisu nie uwzględniono.
 - Serwer nie zapisuje plików; dane przesyłane są bezpośrednio między przeglądarkami.

 Fallback (bez TURN):
 - Aplikacja próbuje najpierw nawiązać bezpośrednie połączenie P2P przez WebRTC (STUN). Jeśli to nie zadziała (np. symmetric NAT), automatycznie następuje fallback: plik jest przesyłany binarnie przez WebSocket przez serwer, ale *nie jest zapisywany na dysku* — serwer przekazuje strumień bajtów między klientami (w pamięci) i nie trzyma trwałej kopii.
 - Fallback pozwala działać tylko z użyciem HTTP(S)/WebSocket (czyli bez wystawiania dodatkowych usług jak TURN), kosztem wykorzystania pasma serwera (serwer relayuje ruch w czasie rzeczywistym).

 Konfiguracja HTTPS:
 - W środowisku produkcyjnym przeglądarki zwykle wymagają HTTPS dla funkcji WebRTC (poza `localhost`). Zamieść serwer za reverse-proxy TLS (np. nginx) lub uzupełnij konfigurację certyfikatami.

Deploy w Portainer / z Git
--------------------------------
- Możesz zdeployować ten projekt bezpośrednio z repozytorium Git w Portainerze jako "Stack from git" — wybierz `docker-compose.yml` (plik w repo) i Portainer zbuduje obraz używając `Dockerfile`.
- Upewnij się, że Portainer ma dostęp do internetu i że w opcjach budowy ustawione jest użycie cache/buildkit jeśli potrzebne.
- Po wdrożeniu sprawdź status kontenera i healthcheck (używany przez `docker-compose.yml`) w panelu Portainera. Kontener będzie wykonywał `/health` co 30s.

Przykładowe kroki w Portainer (skrót):
1. Wybierz Stacks → Add stack → "Deploy from Git"
2. Podaj URL repo (np. https://github.com/your/repo) i ścieżkę do `docker-compose.yml` (root), kliknij Deploy.
3. Po uruchomieniu przejdź do Containers → wybierz kontener `drag-drop` → sprawdź Logs i Health status.

Jeśli Portainer uruchomił starszą wersję (bez nowych endpointów), zrób rebuild staku (re-deploy) aby Portainer zbudował obraz z najnowszego kodu.

Debugowanie — krótkie checklisty
- Jeśli kontener nie startuje: sprawdź `docker logs <container>` oraz `docker ps -a` status kodu zakończenia.
- Jeśli `/status` daje 404 wewnątrz kontenera, to znaczy, że kontener uruchamia inną wersję aplikacji — wymuś rebuild.
- Jeśli Cloudflare/Tunnel stoi przed aplikacją, najpierw upewnij się, że `curl http://localhost:3000/status` z wnętrza kontenera aplikacji zwraca JSON (użyj `docker exec -it <app> sh` i `curl`). Jeśli to działa, problem leży w tunelu.

