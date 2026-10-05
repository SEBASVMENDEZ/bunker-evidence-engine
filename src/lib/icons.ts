// Iconos de áreas: los mismos trazos se usan en la interfaz (SVG) y en la película (canvas).
import {
  HandHeart, Flower2, PersonStanding, BookOpen, Dumbbell, ChartCandlestick, Rocket, MicVocal,
  Sunrise, Brain, Wallet, Users, Heart, HeartPulse, Footprints, Bike, Code, PenLine, Languages,
  GraduationCap, Music, Leaf, Coffee, Target, Flame, Mountain, Church, Sparkles, Moon, Palette,
  Briefcase, House, Droplets, Apple, Wind, Compass, Camera, Zap,
} from 'lucide';

type Attrs = Record<string, string | number | undefined>;
type Node = [string, Attrs][];

export const AREA_ICONS: Record<string, Node> = {
  oracion: HandHeart as Node,
  iglesia: Church as Node,
  meditacion: Flower2 as Node,
  respiracion: Wind as Node,
  estiramiento: PersonStanding as Node,
  lectura: BookOpen as Node,
  ejercicio: Dumbbell as Node,
  trading: ChartCandlestick as Node,
  proyecto: Rocket as Node,
  reflexion: MicVocal as Node,
  amanecer: Sunrise as Node,
  mente: Brain as Node,
  finanzas: Wallet as Node,
  familia: Users as Node,
  corazon: Heart as Node,
  salud: HeartPulse as Node,
  caminar: Footprints as Node,
  bici: Bike as Node,
  codigo: Code as Node,
  escritura: PenLine as Node,
  idiomas: Languages as Node,
  estudio: GraduationCap as Node,
  musica: Music as Node,
  naturaleza: Leaf as Node,
  cafe: Coffee as Node,
  meta: Target as Node,
  fuego: Flame as Node,
  montana: Mountain as Node,
  chispa: Sparkles as Node,
  noche: Moon as Node,
  arte: Palette as Node,
  trabajo: Briefcase as Node,
  hogar: House as Node,
  agua: Droplets as Node,
  nutricion: Apple as Node,
  brujula: Compass as Node,
  camara: Camera as Node,
  energia: Zap as Node,
};

export function iconInner(name: string): string {
  const node = AREA_ICONS[name] ?? AREA_ICONS.chispa;
  return node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k, v]) => v !== undefined && k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
}

export function iconSvg(name: string, color = '#fff', strokeWidth = 1.75, size = 24): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${iconInner(name)}</svg>`
  );
}

const imgCache = new Map<string, HTMLImageElement>();

/** Imagen lista para dibujar en canvas (se cachea). */
export function iconImage(name: string, color = '#fff', size = 256): Promise<HTMLImageElement> {
  const key = `${name}|${color}|${size}`;
  const hit = imgCache.get(key);
  if (hit && hit.complete) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image(size, size);
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg(name, color, 1.6, size));
    imgCache.set(key, img);
  });
}

export function iconImageSync(name: string, color = '#fff', size = 256): HTMLImageElement | null {
  const img = imgCache.get(`${name}|${color}|${size}`);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}
