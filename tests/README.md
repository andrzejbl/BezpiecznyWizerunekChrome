# Testy zachowania po refaktoryzacji

Wymagany jest Node.js 20 lub nowszy. Testy podstawowe nie potrzebują instalowania pakietów:

```text
npm test
```

Polecenie uruchamia trzy zestawy za pomocą wbudowanego mechanizmu uruchamiania testów Node.js z `--experimental-vm-modules`: `architecture.test.cjs`, `business-flows.test.cjs` i `regression.test.cjs`. Ostrzeżenie Node o eksperymentalnych modułach VM jest oczekiwane.

`fixtures/original/` to niezmienna kopia sześciu plików aplikacji sprzed podziału na moduły: JavaScript, HTML, CSS i manifest. Nie jest ładowana przez rozszerzenie. Nie aktualizuj jej razem z kodem produkcyjnym: służy jako niezależny punkt odniesienia.

Dopuszczenie zdjęć PNG jest celowym wyjątkiem od zgodności z tą kopią: poprzednia
wersja pomijała PNG w widoku i eksporcie. Obecna przyjmuje je na tych samych
warunkach co JPEG/JPG. Osobne testy sprawdzają reguły kwalifikacji oraz obecność
PNG w widoku i eksporcie. W scenariuszu porównującym nieobsługiwany format z dawną
wersją używamy WebP, które obie wersje nadal pomijają. Zaktualizowane opisy
obsługiwanych formatów w oknie rozszerzenia i PDF również są zamierzoną różnicą.

Testy uruchamiają obie wersje w osobnych kontekstach i porównują:

- widoczny HTML i pełny CSS;
- DOM okna rozszerzenia, teksty, atrybuty, przyciski, zakładki i reakcje na akcje;
- dane skopiowane oraz pliki JSON i CSV;
- komunikaty rozszerzenia, komendy CDP i wyniki sekwencji zdarzeń skanowania;
- dane dowodowe, układ stron oraz pełną zawartość binarną PDF i ZIP;
- eksport podczas skanowania, w tym potwierdzenie i anulowanie.

Zegar, odpowiedzi Chrome i obrazy są kontrolowanymi danymi testowymi. SHA-256 jest obliczany rzeczywiście, ale synchronicznie wewnątrz obietnicy, aby kolejność pracy puli wątków nie powodowała losowych różnic. Te testy sprawdzają kontrakty i rezultaty aplikacji; nie łączą się z prawdziwą stroną przez Chrome DevTools Protocol.

`fixtures/findings.cjs` opisuje zdjęcie, domenę zewnętrzną, zablokowany skrypt i odczyt pola hasła. `fixtures/states.cjs` udostępnia scenariusze okna rozszerzenia. `fixtures/preview.jpg` jest lokalnym obrazem używanym do testowania osadzenia podglądu w PDF.

Dodatkowe porównanie zrzutów ekranu w Chrome uruchamia `npm run test:visual`; konfigurację opcjonalnego Playwright opisuje główny README projektu.

## Granice warstw

`architecture.test.cjs` sprawdza kierunek importów, kompletność i brak cykli zależności oraz ładowanie biznesu bez Chrome, DOM, kodowania plików i timerów.

`business-flows.test.cjs` uruchamia scenariusze skanowania, okna rozszerzenia i raportu z prostymi portami testowymi. Sprawdza m.in. kolejność przygotowania obserwacji przed przeładowaniem, zachowanie ustaleń po zatrzymaniu, anulowanie działań, świeżość danych po await i zwolnienie stanu zajętości po błędzie.
