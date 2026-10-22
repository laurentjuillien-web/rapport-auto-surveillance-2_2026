export type PreleveurType = 'ISO monoflacon dépression' | 'péristaltique';
export type AsservissementType = 'débit' | 'temps';

export interface AutosurveillanceData {
  nomStep: string;
  dateAutosurveillance: string;
  technicienNom?: string;
  meteo?: string;
  observations?: string;

  // 1. Débitmètres & Paramètres de Débit (Entrée & Sortie)
  entreeHasDebimetre: boolean; // true si débitmètre présent
  entreeDebit: string; // en m³ (cumulé 24h si débitmètre OUI, ou estimé via pompes si NON)
  entreeTempsMarchePompes?: string; // en heures si pas de débitmètre
  entreeDebitPompeNominal?: string; // en m³/h (débit unitaire de la pompe)
  entreeDebitEstime?: string; // Débit estimé calculé = temps × débit pompe

  sortieHasDebimetre: boolean; // true si débitmètre présent
  sortieDebit: string; // en m³ (cumulé 24h si débitmètre OUI, ou estimé via pompes si NON)
  sortieTempsMarchePompes?: string; // en heures si pas de débitmètre
  sortieDebitPompeNominal?: string; // en m³/h (débit unitaire de la pompe)
  sortieDebitEstime?: string; // Débit estimé calculé = temps × débit pompe

  // 2. Équipements Préleveurs
  presencePreleveur: boolean; // true si présence de préleveurs
  preleveurType?: PreleveurType; // 'ISO monoflacon dépression' | 'péristaltique'
  preleveurAsservissement?: AsservissementType; // 'débit' | 'temps'
  preleveurFrequenceDebit?: string; // ex: "10" pour tous les 10 m³
  preleveurFrequenceTemps?: string; // ex: "15" pour toutes les 15 minutes

  // Bilan Entrée
  entreeDate: string;
  entreeHeure: string;
  entreeTemperature: string; // en °C
  entreePhoto: string | null; // Base64 data URL
  entreePhotoNom?: string;

  // Bilan Sortie
  sortieDate: string;
  sortieHeure: string;
  sortieTemperature: string; // en °C
  sortiePhoto: string | null; // Base64 data URL
  sortiePhotoNom?: string;

  // Contact & Transmission
  destinataireEmail?: string;
}

export interface ValidationErrors {
  nomStep?: string;
  dateAutosurveillance?: string;
  entreeDate?: string;
  entreeHeure?: string;
  entreeTemperature?: string;
  entreeDebit?: string;
  entreeTempsMarchePompes?: string;
  entreeDebitPompeNominal?: string;
  entreePhoto?: string;
  sortieDate?: string;
  sortieHeure?: string;
  sortieTemperature?: string;
  sortieDebit?: string;
  sortieTempsMarchePompes?: string;
  sortieDebitPompeNominal?: string;
  sortiePhoto?: string;
  preleveurType?: string;
  preleveurAsservissement?: string;
  preleveurFrequence?: string;
}

export type GenerationStep = 'idle' | 'validating' | 'compressing' | 'generating_pdf' | 'completed' | 'error';
