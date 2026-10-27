import { TAX_WARNING, type Emitter } from '../../payments';
import { Pill } from './common';

// Regla 5 (AC-08): advertencia fija en Pagos y Rendición + estado del emisor (AC-07). El RUT nunca llega al
// navegador: el server solo dice si está configurado.
export default function TaxNotice({ warning, emitter }: { warning?: string; emitter?: Emitter | null }) {
  return (
    <aside className="pay-notice" aria-label="Advertencia tributaria" data-tax-warning="">
      <p className="pay-notice__warn">{warning || TAX_WARNING}</p>
      {emitter && (
        <p className="pay-notice__emitter" data-emitter={emitter.configured ? 'configured' : 'pending'}>
          <Pill tone={emitter.configured ? 'ok' : 'wait'}>{emitter.label}</Pill>{' '}
          {emitter.configured
            ? <>{emitter.name ? `${emitter.name} · ` : ''}Modelo declarado: “{emitter.declaredModel}”.</>
            : <>Falta el RUT del emisor (persona natural): neto e IVA se muestran como <strong>estimados</strong>. Se configura en el server (<code>SII_EMITTER_RUT</code>), nunca en el panel. Modelo: “{emitter.declaredModel}”.</>}
        </p>
      )}
    </aside>
  );
}
