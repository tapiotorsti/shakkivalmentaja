// ---------- Koko näkymän päivitys ----------
function renderAll() {
  renderBoard();
  renderMoves();
  renderNav();
  $("fenInput").value = view.fen();
  $("undoBtn").disabled = activeMoves().length === 0;
  renderLines();
  renderReview();
  drawArrows();
  renderPlay();
  renderPractice();
  renderTutorial();
}

// ---------- Käynnistys ----------
keepAwake();
restore();
if (state.gameId) mergeLibraryEvals(state.gameId); // aiemmin analysoitu peli näkyy heti analysoituna
syncSettingsUI();
syncFetchUI();
syncEngineTexts();
setTab(activeTab, false);
refreshLibraryUI();
rebuildView();
renderAll();
fitPanel(); // laudan piirron jälkeen tiedetään, mistä välilehtialue alkaa
initEngine();
maybeEngineMove(); // jatketaan keskeneräistä peliä, jos koneen vuoro
