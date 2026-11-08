# Kostka

Układanie kostki Rubika krok po kroku: https://paduszynski.github.io/kostkarubika/

- **Skanowanie aparatem**: pokazujesz po kolei 6 ścian, aplikacja rozpoznaje kolory (każdy kolor dokładnie 9 razy), a potem można poprawić pomyłki.
- **Wpisywanie ręczne**: rozłożona kostka, paleta kolorów, sprawdzanie, czy taki układ w ogóle da się ułożyć (z zaznaczeniem błędnych pól).
- **Rozwiązanie**: algorytm dwufazowy Kociemby (`solver.js`, liczony w Web Workerze, zwykle około 20 ruchów) i animacja 3D każdego ruchu z opisem po polsku.

Działa jako aplikacja (PWA): można ją dodać do ekranu głównego i używać bez internetu.

Pliki: `index.html` (cała strona), `solver.js` (model kostki, sprawdzanie i rozwiązywanie), `sw.js` (praca offline). GitHub Pages z gałęzi `master`. Przy każdej zmianie podbij wersję (znaczek, stopka, `meta version`, `CACHE` w `sw.js`).
