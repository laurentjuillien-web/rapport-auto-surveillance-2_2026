/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Droplets,
  Calendar,
  Clock,
  Thermometer,
  Gauge,
  Camera,
  Trash2,
  RefreshCw,
  Download,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FileText,
  Eye,
  X,
  FileCode,
  User as UserIcon,
  CloudSun,
  Share2,
  MessageCircle,
  Mail,
  Send,
} from 'lucide-react';
import { AutosurveillanceData, ValidationErrors, GenerationStep } from './types';
import { processFieldPhoto } from './utils/imageUtils';
import { generateAutosurveillancePdf, downloadPdfBlob, GeneratedPdfResult } from './utils/pdfGenerator';
import {
  shareToWhatsApp,
  shareReportNatively,
  sendReportByEmail,
} from './utils/shareUtils';

const STORAGE_KEY = 'step_autosurveillance_draft_v2';

export default function App() {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const defaultHour = `${String(now.getHours()).padStart(2, '0')}:${String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0')}`;

  const [formData, setFormData] = useState<AutosurveillanceData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not load draft from localStorage", e);
    }
    return {
      nomStep: '',
      dateAutosurveillance: today,
      technicienNom: '',
      meteo: 'Soleil',
      observations: '',
      entreeHasDebimetre: true,
      entreeDebit: '',
      entreeTempsMarchePompes: '',
      entreeDebitPompeNominal: '',
      entreeDebitEstime: '',
      sortieHasDebimetre: true,
      sortieDebit: '',
      sortieTempsMarchePompes: '',
      sortieDebitPompeNominal: '',
      sortieDebitEstime: '',
      presencePreleveur: true,
      preleveurType: 'ISO monoflacon dépression',
      preleveurAsservissement: 'débit',
      preleveurFrequenceDebit: '10',
      preleveurFrequenceTemps: '15',
      entreeDate: today,
      entreeHeure: defaultHour,
      entreeTemperature: '',
      entreePhoto: null,
      entreePhotoNom: '',
      sortieDate: today,
      sortieHeure: defaultHour,
      sortieTemperature: '',
      sortiePhoto: null,
      sortiePhotoNom: '',
      destinataireEmail: '',
    };
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedPdf, setGeneratedPdf] = useState<GeneratedPdfResult | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const entreeFileInputRef = useRef<HTMLInputElement>(null);
  const sortieFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    } catch {
      try {
        const light = { ...formData, entreePhoto: null, sortiePhoto: null };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
      } catch (e2) {
        console.warn("Storage quota exceeded", e2);
      }
    }
  }, [formData]);

  const handleChange = (field: keyof AutosurveillanceData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      if (
        !updated.entreeHasDebimetre &&
        (field === 'entreeTempsMarchePompes' ||
          field === 'entreeDebitPompeNominal' ||
          field === 'entreeHasDebimetre')
      ) {
        const t = parseFloat(updated.entreeTempsMarchePompes || '');
        const q = parseFloat(updated.entreeDebitPompeNominal || '');
        if (!isNaN(t) && !isNaN(q) && t >= 0 && q >= 0) {
          const est = (t * q).toFixed(1);
          updated.entreeDebitEstime = est;
          updated.entreeDebit = est;
        }
      }

      if (
        !updated.sortieHasDebimetre &&
        (field === 'sortieTempsMarchePompes' ||
          field === 'sortieDebitPompeNominal' ||
          field === 'sortieHasDebimetre')
      ) {
        const t = parseFloat(updated.sortieTempsMarchePompes || '');
        const q = parseFloat(updated.sortieDebitPompeNominal || '');
        if (!isNaN(t) && !isNaN(q) && t >= 0 && q >= 0) {
          const est = (t * q).toFixed(1);
          updated.sortieDebitEstime = est;
          updated.sortieDebit = est;
        }
      }

      return updated;
    });

    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field as keyof ValidationErrors];
        return copy;
      });
    }
  };

  const handlePhotoUpload = async (file: File, type: 'entree' | 'sortie') => {
    try {
      setGenerationStep('compressing');
      setStatusMessage(`Optimisation de la photo ${type === 'entree' ? 'Entrée' : 'Sortie'}...`);
      const { dataUrl, fileName } = await processFieldPhoto(file);

      if (type === 'entree') {
        setFormData((prev) => ({ ...prev, entreePhoto: dataUrl, entreePhotoNom: fileName }));
      } else {
        setFormData((prev) => ({ ...prev, sortiePhoto: dataUrl, sortiePhotoNom: fileName }));
      }
      setGenerationStep('idle');
      setStatusMessage('');
    } catch (err: unknown) {
      setGenerationStep('idle');
      alert("Erreur lors de la capture photo.");
    }
  };

  const handleShareWhatsApp = async () => {
    if (!generatedPdf) return;
    try {
      downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName);
      await shareToWhatsApp(formData, generatedPdf.blob, generatedPdf.fileName);
      setShareFeedback("WhatsApp ouvert avec la synthèse !");
      setTimeout(() => setShareFeedback(null), 5000);
    } catch (e) {
      console.error("Erreur partage WhatsApp", e);
    }
  };

  const handleSendEmailDirect = async () => {
    if (!generatedPdf) return;
    try {
      setEmailSending(true);
      downloadPdfBlob(generatedPdf.blob, generatedPdf.fileName);
      const shared = await shareReportNatively(formData, generatedPdf.blob, generatedPdf.fileName);
      if (!shared) {
        sendReportByEmail(formData, generatedPdf.fileName);
      }
      setShareFeedback("Application de messagerie ouverte !");
      setTimeout(() => setShareFeedback(null), 5000);
      setShowEmailModal(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setEmailSending(false);
    }
  };

  const validate = (): boolean => {
    const errs: ValidationErrors = {};
    if (!formData.nomStep.trim()) errs.nomStep = "Nom de la STEP obligatoire.";
    if (!formData.dateAutosurveillance) errs.dateAutosurveillance = "Date obligatoire.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setGenerationStep('generating_pdf');
    setStatusMessage("Génération du document PDF officiel...");

    try {
      await new Promise((r) => setTimeout(r, 200));
      const res = await generateAutosurveillancePdf(formData);
      setGeneratedPdf(res);
      downloadPdfBlob(res.blob, res.fileName);
      setGenerationStep('completed');
      setShowPdfModal(true);
    } catch (err: unknown) {
      console.error(err);
      setGenerationStep('error');
      alert("Erreur lors de la génération du rapport.");
    } finally {
      setGenerationStep('idle');
    }
  };

  const handleLoadSample = () => {
    const generateSampleCanvas = (title: string, color: string): string => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d');
      if (!ctx) return '';
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = color;
      ctx.fillRect(100, 70, 440, 340);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(title, 140, 310);
      return c.toDataURL('image/jpeg', 0.85);
    };

    setFormData({
      nomStep: "STEP Goderville",
      dateAutosurveillance: today,
      technicienNom: "Laurent JUILLIEN",
      meteo: "Soleil",
      observations: "Essai",
      entreeHasDebimetre: false,
      entreeDebit: "45.0",
      entreeTempsMarchePompes: "1.5",
      entreeDebitPompeNominal: "30",
      entreeDebitEstime: "45.0",
      sortieHasDebimetre: false,
      sortieDebit: "60.0",
      sortieTempsMarchePompes: "2",
      sortieDebitPompeNominal: "30",
      sortieDebitEstime: "60.0",
      presencePreleveur: true,
      preleveurType: "péristaltique",
      preleveurAsservissement: "débit",
      preleveurFrequenceDebit: "10",
      preleveurFrequenceTemps: "15",
      entreeDate: today,
      entreeHeure: defaultHour,
      entreeTemperature: "2.1",
      entreePhoto: generateSampleCanvas("PHOTO : PRELEVEUR ENTREE", "#0369a1"),
      entreePhotoNom: "preleveur_entree.jpg",
      sortieDate: today,
      sortieHeure: defaultHour,
      sortieTemperature: "2.5",
      sortiePhoto: generateSampleCanvas("PHOTO : PRELEVEUR SORTIE", "#047857"),
      sortiePhotoNom: "preleveur_sortie.jpg",
      destinataireEmail: 'laurentjuillien@free.fr',
    });
    setErrors({});
  };

  const handleReset = () => {
    if (confirm("Réinitialiser le formulaire ?")) {
      localStorage.removeItem(STORAGE_KEY);
      setFormData({
        nomStep: '',
        dateAutosurveillance: today,
        technicienNom: '',
        meteo: 'Soleil',
        observations: '',
        entreeHasDebimetre: true,
        entreeDebit: '',
        entreeTempsMarchePompes: '',
        entreeDebitPompeNominal: '',
        entreeDebitEstime: '',
        sortieHasDebimetre: true,
        sortieDebit: '',
        sortieTempsMarchePompes: '',
        sortieDebitPompeNominal: '',
        sortieDebitEstime: '',
        presencePreleveur: true,
        preleveurType: 'ISO monoflacon dépression',
        preleveurAsservissement: 'débit',
        preleveurFrequenceDebit: '10',
        preleveurFrequenceTemps: '15',
        entreeDate: today,
        entreeHeure: defaultHour,
        entreeTemperature: '',
        entreePhoto: null,
        entreePhotoNom: '',
        sortieDate: today,
        sortieHeure: defaultHour,
        sortieTemperature: '',
        sortiePhoto: null,
        sortiePhotoNom: '',
        destinataireEmail: '',
      });
      setErrors({});
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans pb-12">
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center text-white">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-white">
                Autosurveillance STEP <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-sky-950 text-sky-400">Terrain</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Exemple</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-rose-300 bg-rose-950/40 p-2 rounded-xl border border-rose-800 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-3.5 sm:px-6 py-6 flex-1 space-y-6">
        {generatedPdf && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 text-emerald-950 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Rapport PDF généré et téléchargé !</span>
              </h3>
              <p className="text-xs text-emerald-800 mt-1">Station : <strong>{formData.nomStep}</strong></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="px-3.5 py-2.5 bg-[#25D366] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setShowEmailModal(true)}
                className="px-3.5 py-2.5 bg-sky-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>E-mail</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="px-3.5 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Aperçu PDF</span>
              </button>
            </div>
          </div>
        )}

        {shareFeedback && (
          <div className="bg-sky-50 border border-sky-300 text-sky-900 p-3 rounded-xl text-xs font-medium">
            {shareFeedback}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 1. INFORMATIONS GENERALES */}
          <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-4">1. En-tête &amp; Informations Générales</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nom de la STEP *</label>
                <input
                  type="text"
                  value={formData.nomStep}
                  onChange={(e) => handleChange('nomStep', e.target.value)}
                  placeholder="ex: STEP Goderville"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date *</label>
                <input
                  type="date"
                  value={formData.dateAutosurveillance}
                  onChange={(e) => handleChange('dateAutosurveillance', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Technicien</label>
                <input
                  type="text"
                  value={formData.technicienNom}
                  onChange={(e) => handleChange('technicienNom', e.target.value)}
                  placeholder="ex: Laurent JUILLIEN"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Météo</label>
                <select
                  value={formData.meteo}
                  onChange={(e) => handleChange('meteo', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                >
                  <option value="Soleil">Soleil</option>
                  <option value="Pluie">Pluie</option>
                  <option value="Neige">Neige</option>
                  <option value="Orage">Orage</option>
                </select>
              </div>
            </div>
          </section>

          {/* 2. ENTREE & SORTIE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-sky-900">Point Entrée (Eaux Brutes)</h2>
              <div>
                <label className="block text-xs font-semibold mb-1">Mode de mesure</label>
                <div className="flex gap-4 text-xs font-medium">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={formData.entreeHasDebimetre}
                      onChange={() => handleChange('entreeHasDebimetre', true)}
                    /> Débitmètre
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!formData.entreeHasDebimetre}
                      onChange={() => handleChange('entreeHasDebimetre', false)}
                    /> Estimé (Pompes)
                  </label>
                </div>
              </div>

              {formData.entreeHasDebimetre ? (
                <div>
                  <label className="block text-xs font-semibold mb-1">Débit cumulé 24h (m³)</label>
                  <input
                    type="number"
                    value={formData.entreeDebit}
                    onChange={(e) => handleChange('entreeDebit', e.target.value)}
                    placeholder="ex: 2580"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Temps marche (h)</label>
                    <input
                      type="number"
                      value={formData.entreeTempsMarchePompes}
                      onChange={(e) => handleChange('entreeTempsMarchePompes', e.target.value)}
                      placeholder="ex: 1.5"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Débit nominal (m³/h)</label>
                    <input
                      type="number"
                      value={formData.entreeDebitPompeNominal}
                      onChange={(e) => handleChange('entreeDebitPompeNominal', e.target.value)}
                      placeholder="ex: 30"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1">Heure relève</label>
                  <input
                    type="time"
                    value={formData.entreeHeure}
                    onChange={(e) => handleChange('entreeHeure', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Température (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.entreeTemperature}
                    onChange={(e) => handleChange('entreeTemperature', e.target.value)}
                    placeholder="ex: 2.1"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Photo Entrée</label>
                <input
                  type="file"
                  accept="image/*"
                  ref={entreeFileInputRef}
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], 'entree')}
                  className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
                />
              </div>
            </section>

            <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-emerald-900">Point Sortie (Rejet Traité)</h2>
              <div>
                <label className="block text-xs font-semibold mb-1">Mode de mesure</label>
                <div className="flex gap-4 text-xs font-medium">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={formData.sortieHasDebimetre}
                      onChange={() => handleChange('sortieHasDebimetre', true)}
                    /> Débitmètre
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!formData.sortieHasDebimetre}
                      onChange={() => handleChange('sortieHasDebimetre', false)}
                    /> Estimé (Pompes)
                  </label>
                </div>
              </div>

              {formData.sortieHasDebimetre ? (
                <div>
                  <label className="block text-xs font-semibold mb-1">Débit cumulé 24h (m³)</label>
                  <input
                    type="number"
                    value={formData.sortieDebit}
                    onChange={(e) => handleChange('sortieDebit', e.target.value)}
                    placeholder="ex: 2680"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Temps marche (h)</label>
                    <input
                      type="number"
                      value={formData.sortieTempsMarchePompes}
                      onChange={(e) => handleChange('sortieTempsMarchePompes', e.target.value)}
                      placeholder="ex: 2"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Débit nominal (m³/h)</label>
                    <input
                      type="number"
                      value={formData.sortieDebitPompeNominal}
                      onChange={(e) => handleChange('sortieDebitPompeNominal', e.target.value)}
                      placeholder="ex: 30"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1">Heure relève</label>
                  <input
                    type="time"
                    value={formData.sortieHeure}
                    onChange={(e) => handleChange('sortieHeure', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Température (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.sortieTemperature}
                    onChange={(e) => handleChange('sortieTemperature', e.target.value)}
                    placeholder="ex: 2.5"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Photo Sortie</label>
                <input
                  type="file"
                  accept="image/*"
                  ref={sortieFileInputRef}
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0], 'sortie')}
                  className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>
            </section>
          </div>

          {/* OBSERVATIONS */}
          <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Observations / Remarques d'exploitation</label>
            <textarea
              rows={3}
              value={formData.observations}
              onChange={(e) => handleChange('observations', e.target.value)}
              placeholder="Remarques particulières..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50"
            />
          </section>

          <button
            type="submit"
            className="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white font-extrabold rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-5 h-5" />
            <span>Générer et Télécharger le Rapport PDF Officiel</span>
          </button>
        </form>
      </main>

      {showPdfModal && generatedPdf && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-4xl h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold">Aperçu du Rapport PDF</h3>
              <button onClick={() => setShowPdfModal(false)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-2">
              <iframe src={generatedPdf.blobUrl} className="w-full h-full rounded-xl border bg-white" title="PDF" />
            </div>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-extrabold text-slate-900">Transmission par E-mail</h3>
              <button onClick={() => setShowEmailModal(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">Le rapport PDF officiel va être transmis via votre client de messagerie.</p>
            <button
              type="button"
              disabled={emailSending}
              onClick={handleSendEmailDirect}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              {emailSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Ouvrir l'application de messagerie</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
