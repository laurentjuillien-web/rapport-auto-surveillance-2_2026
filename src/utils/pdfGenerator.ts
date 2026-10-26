// 4. SECTION D'ANALYSE SPÉCIFIQUE : ÉQUIPEMENTS & PARAMÈTRES D'EXPLOITATION
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  const equipBlockHeight = 28;
  doc.roundedRect(margin, curY, contentWidth, equipBlockHeight, 1.5, 1.5, 'FD');

  // Titre du bloc équipements
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, curY, contentWidth, 5.5, 1.5, 1.5, 'F');
  doc.rect(margin, curY + 2.5, contentWidth, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text("ANALYSE DES ÉQUIPEMENTS D'EXPLOITATION : DÉBITMÈTRES & PRÉLEVEURS", margin + 4, curY + 3.8);

  // Colonne Gauche : Débitmètres
  const subColW = (contentWidth - 6) / 2;
  const leftX = margin + 3;
  const rightX = margin + subColW + 6;
  let eqY = curY + 9.5;

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text("1. Mode de mesure des Débits :", leftX, eqY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  // Entrée
  const txtEntreeDeb = data.entreeHasDebimetre
    ? `• Entrée : Débitmètre [OUI] - Débit cumulé = ${data.entreeDebit || '-'} m³`
    : `• Entrée : Débitmètre [NON] - Estimé = ${data.entreeDebit || '-'} m³ (${data.entreeTempsMarchePompes || '-'}h × ${data.entreeDebitPompeNominal || '-'} m³/h)`;
  doc.text(txtEntreeDeb, leftX + 2, eqY + 5);

  // Sortie
  const txtSortieDeb = data.sortieHasDebimetre
    ? `• Sortie : Débitmètre [OUI] - Débit cumulé = ${data.sortieDebit || '-'} m³`
    : `• Sortie : Débitmètre [NON] - Estimé = ${data.sortieDebit || '-'} m³ (${data.sortieTempsMarchePompes || '-'}h × ${data.sortieDebitPompeNominal || '-'} m³/h)`;
  doc.text(txtSortieDeb, leftX + 2, eqY + 10);

  // Colonne Droite : Préleveurs
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text("2. Équipements Préleveurs 24h :", rightX, eqY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  if (data.presencePreleveur) {
    doc.text(`• Présence de préleveur(s) : OUI`, rightX + 2, eqY + 5);
    const freqTxt = data.preleveurAsservissement === 'débit'
      ? `Tous les ${data.preleveurFrequenceDebit || '-'} m³`
      : `Toutes les ${data.preleveurFrequenceTemps || '-'} minutes`;
    doc.text(`• Type : ${data.preleveurType || 'Non précisé'} | Asservissement : ${data.preleveurAsservissement || 'débit'}`, rightX + 2, eqY + 9.5);
    doc.text(`• Fréquence : ${freqTxt}`, rightX + 2, eqY + 14);
  } else {
    doc.text(`• Présence de préleveur(s) : NON`, rightX + 2, eqY + 5);
    doc.text(`• Mode de collecte : Échantillonnage manuel`, rightX + 2, eqY + 10);
  }
