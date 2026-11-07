// Données relevées à la main (mises à jour chaque samedi). Les prix en direct viennent des widgets TradingView.
window.DATA = {
  miseAJour: "7 novembre 2026",
  fermeture: "vendredi 6 novembre 2026",

  // Détroit d'Ormuz — hormuz.now (comptage AIS) et IMF PortWatch
  ormuzPeriodes: [
    { libelle: "1 jour (6 nov.)", observe: 13, normal: 85 },
    { libelle: "7 derniers jours", observe: 61, normal: 594 },
    { libelle: "30 derniers jours", observe: 148, normal: 2544 }
  ],
  ormuzNormalParJour: 85,
  ormuzMensuel: [
    { mois: "janv.", v: 58.5 }, { mois: "févr.", v: 78.3 }, { mois: "mars", v: 3.2 },
    { mois: "avr.", v: 7.1 }, { mois: "mai", v: 3.9 }, { mois: "juin", v: 12.9 },
    { mois: "juil.", v: 10.2 }, { mois: "août", v: 4.7 }, { mois: "sept.", v: 3.6 },
    { mois: "oct.", v: 3.5 }, { mois: "nov.*", v: 8.5 }
  ],
  ormuzQuotidien: [
    ["19 oct", 0], ["20 oct", 7], ["21 oct", 11], ["22 oct", 6], ["23 oct", 9], ["24 oct", 6], ["25 oct", 4],
    ["26 oct", 8], ["27 oct", 5], ["28 oct", 6], ["29 oct", 11], ["30 oct", 13], ["31 oct", 12],
    ["1 nov", 10], ["2 nov", 5], ["3 nov", 7], ["4 nov", 7], ["5 nov", 9], ["6 nov", 13]
  ],

  // Exportations de pétrole 2025, milliers de barils/jour (brut + produits) — OPEP via Visual Capitalist
  exportateurs: [
    ["États-Unis", 10714], ["Arabie saoudite", 7915], ["Russie", 6634], ["Canada", 4129],
    ["Émirats arabes unis", 3901], ["Irak", 3478], ["Koweït", 2409], ["Brésil", 2353],
    ["Pays-Bas", 2111], ["Iran", 2083], ["Norvège", 2005], ["Nigeria", 1633],
    ["Singapour", 1631], ["Kazakhstan", 1587], ["Inde", 1386], ["Corée du Sud", 1372],
    ["Chine", 1322], ["Libye", 1285], ["Oman", 1136], ["Malaisie", 1014]
  ],

  // Moyennes mensuelles 2026 (BCE via fxrates.com) — novembre partiel
  devises: {
    mois: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov."],
    usdcad: [1.3779, 1.3651, 1.3712, 1.3751, 1.3730, 1.4036, 1.4118, 1.3908, 1.3961, 1.4140, 1.3983],
    eurusd: [1.1738, 1.1824, 1.1558, 1.1706, 1.1673, 1.1518, 1.1417, 1.1593, 1.1513, 1.1202, 1.1210],
    eurcad: [1.6173, 1.6140, 1.5848, 1.6097, 1.6027, 1.6165, 1.6119, 1.6123, 1.6073, 1.5839, 1.5675]
  }
};
