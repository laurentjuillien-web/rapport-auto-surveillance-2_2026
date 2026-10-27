export interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  formatted: string;
}

/**
 * Récupère la position GPS de l'appareil (via l'API Geolocation HTML5)
 * Format strict : Degrés Décimaux (ex: 47.389214, 0.689421)
 * Actualisation forcée en temps réel (maximumAge: 0).
 */
export async function getDeviceGpsPosition(): Promise<GpsPosition | null> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy || 0);
        // Format Degrés Décimaux standard exigé (ex: 47.389214, 0.689421)
        const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        resolve({
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          formatted,
        });
      },
      (err) => {
        console.warn("GPS haute précision indisponible, tentative standard...", err.message);
        // Deuxième essai sans haute précision pour garantir une position même en intérieur / 4G
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            const lat2 = pos2.coords.latitude;
            const lng2 = pos2.coords.longitude;
            const acc2 = Math.round(pos2.coords.accuracy || 0);
            const formatted2 = `${lat2.toFixed(6)}, ${lng2.toFixed(6)}`;
            resolve({
              latitude: lat2,
              longitude: lng2,
              accuracy: acc2,
              formatted: formatted2,
            });
          },
          (err2) => {
            console.warn("Position GPS terrain non accessible :", err2.message);
            resolve(null);
          },
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Tente d'extraire les coordonnées GPS stockées dans les métadonnées EXIF du fichier image
 */
export async function tryExtractExifGps(file: File): Promise<GpsPosition | null> {
  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
    const dataView = new DataView(buffer);

    // Vérifier marqueur SOI JPEG (0xFFD8)
    if (dataView.getUint16(0, false) !== 0xFFD8) {
      return null;
    }

    let offset = 2;
    const length = dataView.byteLength;

    while (offset < length - 4) {
      const marker = dataView.getUint16(offset, false);
      offset += 2;

      // APP1 Marker (Exif) = 0xFFE1
      if (marker === 0xFFE1) {
        const app1Length = dataView.getUint16(offset, false);
        offset += 2;

        // "Exif\0\0"
        if (
          dataView.getUint32(offset, false) === 0x45786966 &&
          dataView.getUint16(offset + 4, false) === 0x0000
        ) {
          const tiffStart = offset + 6;
          const isLittleEndian = dataView.getUint16(tiffStart, false) === 0x4949;

          const get16 = (o: number) => dataView.getUint16(tiffStart + o, isLittleEndian);
          const get32 = (o: number) => dataView.getUint32(tiffStart + o, isLittleEndian);

          // 0x002A standard TIFF
          if (get16(2) !== 0x002A) return null;

          const ifd0Offset = get32(4);
          const ifd0Entries = get16(ifd0Offset);

          let gpsOffset = 0;
          for (let i = 0; i < ifd0Entries; i++) {
            const entryOffset = ifd0Offset + 2 + i * 12;
            const tag = get16(entryOffset);
            // GPS IFD tag = 0x8825
            if (tag === 0x8825) {
              gpsOffset = get32(entryOffset + 8);
              break;
            }
          }

          if (gpsOffset > 0) {
            const gpsEntries = get16(gpsOffset);
            let latRef = 'N';
            let lngRef = 'E';
            let latValues: number[] | null = null;
            let lngValues: number[] | null = null;

            for (let i = 0; i < gpsEntries; i++) {
              const entryOffset = gpsOffset + 2 + i * 12;
              const tag = get16(entryOffset);
              const valOffset = get32(entryOffset + 8);

              if (tag === 1) { // GPSLatitudeRef
                latRef = String.fromCharCode(dataView.getUint8(tiffStart + entryOffset + 8));
              } else if (tag === 2) { // GPSLatitude
                latValues = [
                  get32(valOffset) / get32(valOffset + 4),
                  get32(valOffset + 8) / get32(valOffset + 12),
                  get32(valOffset + 16) / get32(valOffset + 20),
                ];
              } else if (tag === 3) { // GPSLongitudeRef
                lngRef = String.fromCharCode(dataView.getUint8(tiffStart + entryOffset + 8));
              } else if (tag === 4) { // GPSLongitude
                lngValues = [
                  get32(valOffset) / get32(valOffset + 4),
                  get32(valOffset + 8) / get32(valOffset + 12),
                  get32(valOffset + 16) / get32(valOffset + 20),
                ];
              }
            }

            if (latValues && lngValues) {
              let lat = latValues[0] + latValues[1] / 60 + latValues[2] / 3600;
              let lng = lngValues[0] + lngValues[1] / 60 + lngValues[2] / 3600;
              if (latRef === 'S') lat = -lat;
              if (lngRef === 'W' || lngRef === 'O') lng = -lng;

              const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

              return {
                latitude: lat,
                longitude: lng,
                formatted,
              };
            }
          }
        }
        break;
      } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
        // Skip marker
        const markerLength = dataView.getUint16(offset, false);
        offset += markerLength;
      } else {
        break;
      }
    }
  } catch (err) {
    console.warn("Lecture EXIF GPS impossible :", err);
  }

  return null;
}

export interface StampInfo {
  stepName?: string;
  pointName?: string;
  dateTime?: string;
  gpsText?: string;
}

/**
 * Optimise et compresse l'image pour un rendu fluide et rapide,
 * et appose optionnellement le bandeau réglementaire terrain (Horodatage + GPS).
 */
export async function processFieldPhoto(
  file: File,
  maxWidth = 1280,
  maxHeight = 960,
  quality = 0.82,
  stampInfo?: StampInfo
): Promise<{ dataUrl: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Erreur de lecture du fichier photo'));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Impossible de charger l\'image'));

      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Erreur d\'initialisation canvas 2D'));
          return;
        }

        // Dessin image haute qualité
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Apposer le bandeau d'horodatage et de géolocalisation GPS si fourni
        if (stampInfo && (stampInfo.gpsText || stampInfo.dateTime || stampInfo.stepName)) {
          const bannerHeight = Math.max(38, Math.round(height * 0.085));
          const y = height - bannerHeight;

          // Fond sombre dégradé semi-transparent
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(0, y, width, bannerHeight);

          // Liseré supérieur bleu technique
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(0, y, width, Math.max(2, Math.round(bannerHeight * 0.08)));

          // Textes certifiés
          ctx.fillStyle = '#ffffff';
          const fontSize1 = Math.max(11, Math.round(bannerHeight * 0.32));
          const fontSize2 = Math.max(10, Math.round(bannerHeight * 0.28));

          ctx.font = `bold ${fontSize1}px sans-serif`;
          const title = `${stampInfo.pointName || 'CONTRÔLE'} • ${stampInfo.stepName || 'STEP'}${stampInfo.dateTime ? ` • ${stampInfo.dateTime}` : ''}`;
          ctx.fillText(title, 14, y + fontSize1 + 5);

          if (stampInfo.gpsText) {
            ctx.fillStyle = '#38bdf8'; // Bleu ciel lumineux
            ctx.font = `600 ${fontSize2}px monospace`;
            ctx.fillText(`📍 GPS : ${stampInfo.gpsText}`, 14, y + bannerHeight - 7);
          }
        }

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          dataUrl: compressedDataUrl,
          fileName: file.name || `photo_${Date.now()}.jpg`,
        });
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
