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
