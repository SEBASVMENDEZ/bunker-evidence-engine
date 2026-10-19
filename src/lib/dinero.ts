// Dinero hoy (Paquete I-3): tus pagos del mes y cuáles vencen en los próximos días.
// Los pagos los escribes tú en Ajustes (o los importas de un archivo de TU dispositivo): viven en
// IndexedDB y en el respaldo, NUNCA en el código (el repositorio es público).
import { dayKey } from './time';

export interface Pago {
  id: string;
  name: string;
  valor: number; // pesos
  dia: number; // día del mes (1–31; en meses cortos se corre al último día)
  protegido: boolean; // se separa primero el día de pago: no se toca
  desde: string; // YYYY-MM-DD: no avisa vencimientos anteriores a cuando lo agregaste
}

/** Un vencimiento concreto de un pago. ciclo = YYYY-MM al que corresponde. */
export interface Vence {
  pago: Pago;
  ciclo: string;
  fecha: string; // YYYY-MM-DD
  dias: number; // días que faltan (negativo = vencido)
}

/** Clave de "ya lo pagué" para un pago en un mes. */
export const pagadoKey = (pagoId: string, ciclo: string) => `${pagoId}|${ciclo}`;

/** La fecha en que vence un pago en el mes de `y`/`m0` (mes 0–11). */
export function fechaPago(p: Pago, y: number, m0: number): string {
  const ultimo = new Date(y, m0 + 1, 0).getDate();
  return dayKey(new Date(y, m0, Math.min(p.dia, ultimo)));
}

const entre = (a: string, b: string) => Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / 864e5);

/** Lo que hay que pagar: lo vencido sin marcar (hasta un mes atrás) y lo que vence en los próximos `ventana` días. */
export function porPagar(pagos: Pago[], pagados: Record<string, number>, hoy: string, ventana = 3): Vence[] {
  const [y, m] = hoy.split('-').map(Number);
  const out: Vence[] = [];
  for (const p of pagos) {
    if (!p.dia || !p.name.trim()) continue;
    // mes anterior (vencido sin marcar), este mes y el siguiente (la ventana cruza fin de mes)
    for (const delta of [-1, 0, 1]) {
      const fecha = fechaPago(p, y, m - 1 + delta);
      const ciclo = fecha.slice(0, 7);
      if (pagados[pagadoKey(p.id, ciclo)] || fecha < p.desde) continue;
      const dias = entre(hoy, fecha);
      if (dias <= ventana) out.push({ pago: p, ciclo, fecha, dias });
    }
  }
  return out.sort((a, b) => a.dias - b.dias || +b.pago.protegido - +a.pago.protegido || a.pago.name.localeCompare(b.pago.name));
}

export const pesos = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

export const cuando = (dias: number) =>
  dias < 0 ? `vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'}` : dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence en ${dias} días`;

/** Lee un archivo de pagos: [{ nombre, valor, dia, protegido }] o { pagos: [...] }. Acepta "name" o "nombre". */
export function leerPagos(texto: string): { name: string; valor: number; dia: number; protegido: boolean }[] {
  const data = JSON.parse(texto);
  const lista: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.pagos) ? data.pagos : [];
  return lista
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        name: String(o.nombre ?? o.name ?? '').trim(),
        valor: Math.max(0, Math.round(Number(o.valor) || 0)),
        dia: Math.round(Number(o.dia) || 0),
        protegido: o.protegido === true || o.protegido === 'si' || o.protegido === 'sí',
      };
    })
    .filter((x) => x.name && x.dia >= 1 && x.dia <= 31);
}
