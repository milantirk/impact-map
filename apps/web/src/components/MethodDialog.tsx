import type { Lang } from '@impact-map/engine';
import {
  ALPHA,
  AREA_TAU,
  BUILDUP_DAYS,
  EVIDENCE_WEIGHT,
  OVERLAP_DAYS,
  TAU,
} from '@impact-map/engine';
import { useEffect, useRef } from 'react';

const content: Record<Lang, { title: string; close: string; sections: Array<[string, string[]]> }> =
  {
    hu: {
      title: 'Módszertan',
      close: 'Bezárás',
      sections: [
        [
          '1. Szerkezet',
          [
            'A szövegből tényezők lesznek (pl. „Rendszeres testmozgás”). A tényezők alterületekre hatnak (pl. Testi egészség). Az alterületek egymásra is hatnak, így a hatás távoli területekre is eljut. Az alterületek 8 főterületbe tartoznak. A pozitív érték mindenhol javulást jelent.',
          ],
        ],
        [
          '2. Az általános egyenlet',
          [
            `Közvetlen hatás: d = Σ intenzitás · súly · bizonyíték (A ${EVIDENCE_WEIGHT.A} · B ${EVIDENCE_WEIGHT.B} · C ${EVIDENCE_WEIGHT.C} · D ${EVIDENCE_WEIGHT.D}).`,
            `Terjedés: minden lépésben x ← α · W · x, α = ${ALPHA}. A „Lépések” csúszka adja a lépések számát. Egy út késése a leglassabb lépése.`,
            'Emberek száma: a saját hatás nem nő. A közösségi, társadalmi és globális hatás log10(N) szerint nő és telítődik.',
            `Időablak: ugyanannyi ember hosszabb idő alatt kisebb egyidejű hatást ad. Az átfedő emberek száma N · min(1, T / ablak), T = ${OVERLAP_DAYS.short} / ${OVERLAP_DAYS.mid} / ${OVERLAP_DAYS.long} nap (rövid / közép / hosszú hatás).`,
            `Időtartam: ha a döntés csak D napig tart, a hatás min(1, D / F) része épül fel, F = ${BUILDUP_DAYS.short} / ${BUILDUP_DAYS.mid} / ${BUILDUP_DAYS.long} nap.`,
            `Hatásfok: h = tanh(E / ${TAU}) ∈ [−1; +1]; főterület: tanh(ΣE / ${AREA_TAU}); összkép: a főterületek átlaga (egyenlő súly).`,
            'Bizonytalansági sáv: E ± Σ |út| · (1 − bizonyosság · pontosság). Minél részletesebb a döntési modell, annál szűkebb a sáv. Sárga: az irány nem biztos.',
          ],
        ],
        [
          '3. Döntési kategóriák',
          [
            'A kategóriák az eredményből jönnek, nem előre megadott keretből: fő terület, hatókör (a legtágabb kör legalább 10% hatással), időtáv, hatás mérete, megalapozottság.',
          ],
        ],
        [
          '4. Korlátok',
          [
            'Sok súly szakértői becslés (C, D szint). A tényezők kölcsönhatását a modell nem kezeli. Az eredmény iránymutatás, nem előrejelzés. Minden él forrással és bizonyítéki szinttel visszakövethető.',
          ],
        ],
      ],
    },
    en: {
      title: 'Method',
      close: 'Close',
      sections: [
        [
          '1. Structure',
          [
            'The text becomes factors (e.g. “Regular exercise”). Factors act on subareas (e.g. Physical health). Subareas act on each other, so the impact reaches distant areas too. Subareas belong to 8 main areas. A positive value always means improvement.',
          ],
        ],
        [
          '2. The general equation',
          [
            `Direct impact: d = Σ intensity · weight · evidence (A ${EVIDENCE_WEIGHT.A} · B ${EVIDENCE_WEIGHT.B} · C ${EVIDENCE_WEIGHT.C} · D ${EVIDENCE_WEIGHT.D}).`,
            `Spread: every step x ← α · W · x, α = ${ALPHA}. The “Steps” slider sets the number of steps. The lag of a path is its slowest step.`,
            'Number of people: own impact does not grow. Community, society and global impact grows with log10(N) and saturates.',
            `Time window: the same people over a longer time give a smaller simultaneous impact. Overlapping people = N · min(1, T / window), T = ${OVERLAP_DAYS.short} / ${OVERLAP_DAYS.mid} / ${OVERLAP_DAYS.long} days (short / mid / long effects).`,
            `Duration: a decision kept for D days builds up min(1, D / B) of its effect, B = ${BUILDUP_DAYS.short} / ${BUILDUP_DAYS.mid} / ${BUILDUP_DAYS.long} days.`,
            `Impact degree: h = tanh(E / ${TAU}) ∈ [−1; +1]; main area: tanh(ΣE / ${AREA_TAU}); overall: mean of the main areas (equal weight).`,
            'Uncertainty range: E ± Σ |path| · (1 − certainty · precision). The more detailed the decision model, the narrower the range. Yellow: the direction is not certain.',
          ],
        ],
        [
          '3. Decision categories',
          [
            'Categories come from the result, not from a frame chosen beforehand: main area, reach (widest circle with at least 10% of the impact), time horizon, impact size, certainty.',
          ],
        ],
        [
          '4. Limits',
          [
            'Many weights are expert estimates (level C, D). The model does not handle interactions between factors. The result is guidance, not a forecast. Every link is traceable to a source and an evidence level.',
          ],
        ],
      ],
    },
  };

export function MethodDialog({
  lang,
  open,
  onClose,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  const c = content[lang];
  return (
    <dialog ref={ref} className="method" onClose={onClose} aria-labelledby="method-title">
      <button type="button" className="link close" onClick={onClose} aria-label={c.close}>
        ×
      </button>
      <h2 id="method-title">{c.title}</h2>
      {c.sections.map(([title, paragraphs]) => (
        <section key={title}>
          <h3>{title}</h3>
          {paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </section>
      ))}
    </dialog>
  );
}
