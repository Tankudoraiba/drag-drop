# WebRTC P2P File Transfer (Dockerized)

Prosty projekt umożliwiający przesył plików bezpośrednio między dwoma przeglądarkami przy użyciu WebRTC DataChannel. Serwer pełni wyłącznie rolę sygnalizacyjny (WebSocket) — nie przechowuje plików.

Funkcje:
- Generowanie unikalnego linku sesji
- Sygnalizacja przez WebSocket (HTTP)
- Połączenie P2P przez WebRTC z użyciem DataChannel
- Transfer plików z progressem i natychmiastowym pobraniem po stronie odbiorcy
- Używa tylko publicznego STUN Google (brak TURN)

Uruchomienie lokalne (wymaga Docker + docker-compose):

```powershell
docker compose up --build
# potem otwórz http://localhost:3000
```

Alternatywnie uruchom bez Dockera:

```powershell
npm install
node server.js
# otwórz http://localhost:3000
```

Uwaga: Aby działało w sieciach restrykcyjnych lub wymagających NAT traversal, może być potrzebny TURN — w tym projekcie nie używamy TURN per wymagania.
