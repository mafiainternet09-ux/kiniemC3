import React, { useEffect, useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import heroCourtyardImg from '../assets/images/hero_dreamy_courtyard_1795445051149.jpg';
import year10a3Img from '../assets/images/year_10a3_autumn_1795445050756.jpg';
import year11b3Img from '../assets/images/year_11b3_summer_1795445050330.jpg';
import year12c3Img from '../assets/images/year_12c3_yearbook_1795445050700.jpg';

interface ArchivalMediaFrameProps {
  src?: string;
  alt: string;
  className?: string;
  aspectClass?: string;
  isDemo?: boolean;
  mediaType?: 'image' | 'video';
  label?: string;
}

const GENERATED_PLATE_ASSETS: Record<string, string> = {
  'plate://hero-courtyard': heroCourtyardImg,
  'plate://year-10a3': year10a3Img,
  'plate://year-11b3': year11b3Img,
  'plate://year-12c3': year12c3Img,
};

const PLATE_CONFIG: Record<
  string,
  {
    gradient: string;
    accent: string;
    accentSecondary: string;
    ink: string;
    motif: 'courtyard' | 'classroom' | 'camp' | 'yearbook' | 'flowers' | 'chalkboard';
    sub: string;
  }
> = {
  'plate://hero-courtyard': {
    gradient: 'linear-gradient(135deg, #241914 0%, #592620 55%, #B84233 100%)',
    accent: '#E9C46A',
    accentSecondary: '#F4A261',
    ink: '#FAF7F2',
    motif: 'courtyard',
    sub: 'Sân trường THPT Bình Sơn · Nắng chiều',
  },
  'plate://year-10a3': {
    gradient: 'linear-gradient(135deg, #F6EFE2 0%, #EFE3CF 52%, #E5D6BE 100%)',
    accent: '#B45309',
    accentSecondary: '#15803D',
    ink: '#1C1917',
    motif: 'classroom',
    sub: '10A3 · Hành lang mùa thu',
  },
  'plate://year-11b3': {
    gradient: 'linear-gradient(135deg, #172030 0%, #1E3A5F 50%, #2C5282 100%)',
    accent: '#E9C46A',
    accentSecondary: '#93C5FD',
    ink: '#FAF7F2',
    motif: 'camp',
    sub: '11B3 · Những tháng năm rực rỡ',
  },
  'plate://year-12c3': {
    gradient: 'linear-gradient(135deg, #261414 0%, #68211C 52%, #A8382B 100%)',
    accent: '#E9C46A',
    accentSecondary: '#FCA5A5',
    ink: '#FAF7F2',
    motif: 'yearbook',
    sub: '12C3 · Chương cuối tuổi mười tám',
  },
  'plate://camp-10a3': {
    gradient: 'linear-gradient(135deg, #1F1A17 0%, #4A2B20 52%, #B45309 100%)',
    accent: '#FDE68A',
    accentSecondary: '#FDBA74',
    ink: '#FAF7F2',
    motif: 'camp',
    sub: 'Hội trại 10A3 · Đêm lửa trại',
  },
  'plate://camp-12c3': {
    gradient: 'linear-gradient(135deg, #1E1412 0%, #6B1F1B 52%, #C83E31 100%)',
    accent: '#E9C46A',
    accentSecondary: '#FDBA74',
    ink: '#FAF7F2',
    motif: 'camp',
    sub: 'Hội trại 12C3 · Ánh đèn cuối cấp',
  },
  'plate://ky-yeu-12c3': {
    gradient: 'linear-gradient(135deg, #FBF6EE 0%, #F4E8DC 50%, #EFE2D2 100%)',
    accent: '#C83E31',
    accentSecondary: '#B45309',
    ink: '#1C1917',
    motif: 'yearbook',
    sub: 'Kỷ yếu 12C3 · Hoa phượng & Lưu bút',
  },
  'plate://event-20-10': {
    gradient: 'linear-gradient(135deg, #FAF0EB 0%, #F5DDD6 55%, #EFE3D8 100%)',
    accent: '#C83E31',
    accentSecondary: '#B45309',
    ink: '#1C1917',
    motif: 'flowers',
    sub: '20/10 · Ngày Phụ nữ Việt Nam',
  },
  'plate://event-19-11': {
    gradient: 'linear-gradient(135deg, #EFF4F8 0%, #DCE6F2 55%, #E7EDF4 100%)',
    accent: '#1D4ED8',
    accentSecondary: '#0F766E',
    ink: '#1C1917',
    motif: 'classroom',
    sub: '19/11 · Ngày Quốc tế Nam giới',
  },
  'plate://event-20-11': {
    gradient: 'linear-gradient(135deg, #163327 0%, #1F4A3A 55%, #2B5949 100%)',
    accent: '#E9C46A',
    accentSecondary: '#A7F3D0',
    ink: '#FAF7F2',
    motif: 'chalkboard',
    sub: '20/11 · Phấn trắng & Bục giảng',
  },
  'plate://event-08-03': {
    gradient: 'linear-gradient(135deg, #FDF4EE 0%, #F7E3D7 52%, #F3E8E2 100%)',
    accent: '#C83E31',
    accentSecondary: '#D97706',
    ink: '#1C1917',
    motif: 'flowers',
    sub: '08/03 · Ngày Quốc tế Phụ nữ',
  },
};

function renderMotifSvg(
  motif: 'courtyard' | 'classroom' | 'camp' | 'yearbook' | 'flowers' | 'chalkboard',
  accent: string,
  accentSecondary: string,
  ink: string
) {
  switch (motif) {
    case 'courtyard':
      return (
        <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="sunRayDreamy" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
              <stop offset="100%" stopColor={accentSecondary} stopOpacity="0.06" />
            </linearGradient>
          </defs>
          <polygon points="0,0 520,0 780,500 180,500" fill="url(#sunRayDreamy)" />
          <circle cx="635" cy="115" r="78" fill={accent} fillOpacity="0.18" />
          <g stroke={ink} strokeOpacity="0.18" strokeWidth="1.5" fill="none">
            <rect x="70" y="130" width="660" height="270" rx="22" />
            <line x1="70" y1="220" x2="730" y2="220" />
            <path d="M160 400 V250 A45 45 0 0 1 250 250 V400" />
            <path d="M310 400 V250 A45 45 0 0 1 400 250 V400" />
            <path d="M460 400 V250 A45 45 0 0 1 550 250 V400" />
            <path d="M610 400 V250 A45 45 0 0 1 700 250 V400" />
          </g>
          <g fill={accent} fillOpacity="0.6">
            <circle cx="620" cy="95" r="6" />
            <circle cx="644" cy="112" r="8" />
            <circle cx="602" cy="118" r="5" />
            <circle cx="668" cy="92" r="6" />
            <circle cx="585" cy="98" r="7" />
          </g>
        </svg>
      );
    case 'camp':
      return (
        <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
          <circle cx="160" cy="115" r="70" fill={accentSecondary} fillOpacity="0.16" />
          <path
            d="M40 90 Q240 165 400 115 T760 95"
            fill="none"
            stroke={accent}
            strokeOpacity="0.7"
            strokeWidth="2"
          />
          {[110, 210, 315, 425, 535, 645].map((x, idx) => (
            <circle
              key={x}
              cx={x}
              cy={idx % 2 === 0 ? 124 : 114}
              r="7"
              fill={idx % 2 === 0 ? accent : accentSecondary}
              fillOpacity="0.88"
            />
          ))}
          <g stroke={ink} strokeOpacity="0.26" strokeWidth="1.8" fill="none">
            <polygon points="150,390 275,215 400,390" />
            <line x1="275" y1="215" x2="275" y2="390" />
            <polygon points="440,390 545,245 650,390" />
            <line x1="80" y1="390" x2="720" y2="390" />
          </g>
          <path
            d="M398 386 Q378 338 408 306 Q435 342 417 386 Z"
            fill={accent}
            fillOpacity="0.6"
          />
        </svg>
      );
    case 'chalkboard':
      return (
        <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
          <rect
            x="90"
            y="85"
            width="620"
            height="290"
            rx="22"
            fill="none"
            stroke={ink}
            strokeOpacity="0.24"
            strokeWidth="2"
          />
          <line x1="70" y1="385" x2="730" y2="385" stroke={accent} strokeOpacity="0.75" strokeWidth="4" strokeLinecap="round" />
          <g stroke={ink} strokeOpacity="0.2" strokeWidth="1.5" strokeLinecap="round">
            <line x1="150" y1="165" x2="460" y2="165" />
            <line x1="150" y1="205" x2="390" y2="205" />
            <line x1="150" y1="245" x2="430" y2="245" />
          </g>
          <circle cx="600" cy="235" r="58" fill={accentSecondary} fillOpacity="0.14" stroke={accent} strokeOpacity="0.5" strokeWidth="1.6" />
          <circle cx="600" cy="235" r="34" fill="none" stroke={ink} strokeOpacity="0.24" strokeWidth="1.3" />
        </svg>
      );
    case 'yearbook':
      return (
        <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
          <rect
            x="170"
            y="85"
            width="460"
            height="330"
            rx="24"
            fill="none"
            stroke={ink}
            strokeOpacity="0.22"
            strokeWidth="1.6"
          />
          <line x1="400" y1="85" x2="400" y2="415" stroke={ink} strokeOpacity="0.22" strokeWidth="1.6" />
          <rect
            x="210"
            y="125"
            width="150"
            height="190"
            rx="16"
            fill={accentSecondary}
            fillOpacity="0.16"
            stroke={accent}
            strokeOpacity="0.65"
            strokeWidth="1.6"
          />
          <g stroke={ink} strokeOpacity="0.2" strokeWidth="1.4" strokeLinecap="round">
            <line x1="440" y1="145" x2="590" y2="145" />
            <line x1="440" y1="180" x2="570" y2="180" />
            <line x1="440" y1="215" x2="585" y2="215" />
            <line x1="440" y1="250" x2="540" y2="250" />
          </g>
          <circle cx="515" cy="335" r="28" fill={accent} fillOpacity="0.32" />
        </svg>
      );
    case 'flowers':
      return (
        <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
          <circle cx="400" cy="200" r="145" fill={accentSecondary} fillOpacity="0.14" />
          <g stroke={ink} strokeOpacity="0.22" strokeWidth="1.8" fill="none" strokeLinecap="round">
            <path d="M400 420 Q395 290 355 190" />
            <path d="M400 420 Q410 300 460 205" />
            <path d="M400 420 Q400 280 402 158" />
          </g>
          {[
            { cx: 355, cy: 185, r: 34, c: accent },
            { cx: 460, cy: 200, r: 28, c: accentSecondary },
            { cx: 402, cy: 154, r: 38, c: accent },
          ].map((b, i) => (
            <g key={i}>
              <circle cx={b.cx} cy={b.cy} r={b.r} fill={b.c} fillOpacity="0.28" />
              <circle cx={b.cx} cy={b.cy} r={b.r * 0.48} fill={b.c} fillOpacity="0.58" />
            </g>
          ))}
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 800 500" className="h-full w-full" aria-hidden="true">
          <g stroke={ink} strokeOpacity="0.18" strokeWidth="1.5" fill="none">
            <rect x="110" y="95" width="170" height="270" rx="18" />
            <rect x="315" y="95" width="170" height="270" rx="18" />
            <rect x="520" y="95" width="170" height="270" rx="18" />
            <line x1="110" y1="185" x2="690" y2="185" />
            <line x1="110" y1="275" x2="690" y2="275" />
          </g>
          <polygon points="110,95 490,95 690,420 260,420" fill={accent} fillOpacity="0.16" />
          <circle cx="615" cy="145" r="46" fill={accentSecondary} fillOpacity="0.2" />
        </svg>
      );
  }
}

export const ArchivalMediaFrame: React.FC<ArchivalMediaFrameProps> = ({
  src,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
  isDemo = false,
  mediaType = 'image',
  label,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const mappedAssetSrc = src && GENERATED_PLATE_ASSETS[src] ? GENERATED_PLATE_ASSETS[src] : undefined;
  const resolvedImageSrc = mappedAssetSrc || src;

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedImageSrc]);

  const isPlateSvg =
    !resolvedImageSrc ||
    resolvedImageSrc.startsWith('plate://') ||
    resolvedImageSrc.startsWith('demo-video://');
  const plateKey = src && PLATE_CONFIG[src] ? src : 'plate://hero-courtyard';
  const plate = PLATE_CONFIG[plateKey];

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl bg-[#EFE9DE] ${aspectClass} ${className}`}
    >
      {!isPlateSvg && !imgFailed ? (
        <img
          src={resolvedImageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className="relative flex h-full w-full flex-col justify-between p-5 select-none"
          style={{
            background: plate.gradient,
            color: plate.ink,
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            {renderMotifSvg(plate.motif, plate.accent, plate.accentSecondary, plate.ink)}
          </div>

          <div className="relative z-10 flex items-center justify-between font-mono text-[11px] tracking-[0.14em] opacity-85">
            <span>{isDemo ? 'MẪU DEMO' : 'KỶ NIỆM C3'}</span>
            {mediaType === 'video' ? (
              <Film className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </div>

          <div className="relative z-10 mt-auto">
            <p className="font-serif text-base italic leading-snug sm:text-lg opacity-95">
              {label || plate.sub}
            </p>
          </div>
        </div>
      )}

      {isDemo && !isPlateSvg && !imgFailed && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-md bg-[#1C1917]/80 px-2 py-0.5 font-mono text-[10px] tracking-wider text-[#FAF7F2] backdrop-blur-xs">
          DEMO
        </div>
      )}
    </div>
  );
};
