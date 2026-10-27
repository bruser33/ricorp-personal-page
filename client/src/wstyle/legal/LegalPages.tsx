import type { ReactNode } from 'react';
import { str, type SiteContent } from '../content';
import { ctaLinks, DATA_DELETION_ANCHOR, ext, isDemo, PRIVACY_URL, TERMS_URL } from '../links';

// Política de privacidad y Términos de WS Style (/wstyle/privacidad/ y /wstyle/terminos/). El texto describe lo que
// hace el server de verdad (server/src/routes/auth.js, models/index.js, domain/agenda.js y payments.js): si cambia
// lo que se guarda o con quién se comparte, hay que actualizar estas páginas. Se prerenderizan en el build
// (scripts/prerender-wstyle.mjs) para que el HTML ya traiga el texto (el revisor de Meta y los buscadores lo leen sin JS).
export const LEGAL_UPDATED = '25 de octubre de 2026';
export const OPERATOR = 'Ricorp';
export const OPERATOR_URL = 'https://ricorp.cl';
export const OPERATOR_CONTACT_URL = 'https://ricorp.cl/contacto';

export type LegalKind = 'privacidad' | 'terminos';

function LegalShell({ current, title, children }: { current: LegalKind; title: string; children: ReactNode }) {
  return (
    <div className="ag lg">
      <a className="ag-skip" href="#ag-main">Saltar al contenido</a>
      <header className="ag-header">
        <a className="ag-brand" href="/wstyle/">WS STYLE</a>
        <nav aria-label="Legal" className="ag-nav">
          <a href={PRIVACY_URL} aria-current={current === 'privacidad' ? 'page' : undefined}>Privacidad</a>
          <a href={TERMS_URL} aria-current={current === 'terminos' ? 'page' : undefined}>Términos</a>
        </nav>
      </header>
      <main id="ag-main" className="ag-main lg-main">
        <article className="lg-doc">
          <h1 className="ag-h1">{title}</h1>
          <p className="ag-muted">Última actualización: {LEGAL_UPDATED}</p>
          {children}
        </article>
      </main>
      <footer className="ag-footer lg-footer">
        <a href="/wstyle/">← Volver a WS Style</a>
        <a href={PRIVACY_URL}>Política de privacidad</a>
        <a href={TERMS_URL}>Términos y condiciones</a>
      </footer>
    </div>
  );
}

// Datos de contacto del local (site.json). En modo demo el teléfono es ficticio: se muestra, pero el enlace lleva al
// contacto de Ricorp (ctaLinks), igual que en la landing.
function BusinessContact({ site }: { site: SiteContent }) {
  const name = str(site.name) ?? 'WS Style';
  const ad = site.contact?.address ?? {};
  const address = [str(ad.street), str(ad.city), str(ad.region)].filter(Boolean).join(', ');
  const phone = str(site.contact?.whatsapp) ?? str(site.contact?.phone);
  const l = ctaLinks(site);
  const phoneHref = l.whatsapp ?? l.tel;
  return (
    <ul className="lg-list">
      <li><strong>Responsable del sitio y la agenda en línea:</strong> {OPERATOR} (Pedro Rico), <a href={OPERATOR_URL} target="_blank" rel="noopener">ricorp.cl</a>. Formulario de contacto: <a href={OPERATOR_CONTACT_URL} target="_blank" rel="noopener">ricorp.cl/contacto</a>.</li>
      <li><strong>Local:</strong> {name}{address ? `, ${address}` : ''}.</li>
      {phone && <li><strong>WhatsApp del local:</strong> {phoneHref ? <a href={phoneHref} {...ext(phoneHref)}>{phone}</a> : phone}{isDemo(site) ? ' (sitio en versión de demostración: las consultas llegan a Ricorp).' : '.'}</li>}
    </ul>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section className="lg-section" id={id} aria-labelledby={id ? `${id}-t` : undefined}>
      <h2 className="ag-h3 lg-h2" id={id ? `${id}-t` : undefined}>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage({ site }: { site: SiteContent }) {
  return (
    <LegalShell current="privacidad" title="Política de privacidad">
      <p>
        Esta política explica qué datos personales trata el sitio de WS Style (ricorp.cl/wstyle/) y su agenda en línea,
        para qué, con quién se comparten, cuánto tiempo se guardan y cómo puedes ejercer tus derechos. Se rige por la
        ley chilena: la Ley N° 19.628 sobre protección de la vida privada y su reforma por la Ley N° 21.719.
      </p>

      <Section id="responsable" title="1. Quién es responsable">
        <BusinessContact site={site} />
      </Section>

      <Section id="datos" title="2. Qué datos recopilamos">
        <ul className="lg-list">
          <li><strong>Cuenta:</strong> nombre, correo electrónico y celular. Si creas la cuenta con correo, guardamos tu contraseña solo como un hash cifrado (nunca la contraseña en texto).</li>
          <li><strong>Inicio con Facebook:</strong> si eliges entrar con Facebook, solo pedimos los permisos <em>public_profile</em> y <em>email</em>: recibimos tu nombre, tu correo (si Facebook lo entrega) y un identificador de usuario de Facebook para la app. No publicamos nada en tu nombre ni accedemos a tus amigos, fotos o mensajes.</li>
          <li><strong>Inicio con Google:</strong> si eliges entrar con Google, solo pedimos los permisos <em>openid</em>, <em>email</em> y <em>profile</em>: recibimos tu nombre, tu correo, la indicación de si Google ya verificó ese correo y un identificador de tu cuenta de Google (<em>sub</em>). No guardamos tokens de acceso de Google, no publicamos nada en tu nombre ni accedemos a tus contactos, correos, Drive ni ningún otro dato de tu cuenta.</li>
          <li><strong>Citas:</strong> servicio, barbero, fecha y hora, precio, notas que escribas y el historial de cambios de la cita (confirmaciones, cancelaciones, inasistencias).</li>
          <li><strong>Atención a domicilio:</strong> si la pides, la dirección (calle, comuna y detalles) y su ubicación aproximada para calcular la distancia y el recargo.</li>
          <li><strong>Pagos:</strong> si pagas en línea, el estado del pago y los identificadores, montos y comisiones que informa Mercado Pago. Los datos de tu tarjeta los ingresas en Mercado Pago y <strong>nunca pasan por nuestros servidores</strong>. Si pagas en el local, registramos el medio de pago (efectivo, transferencia o tarjeta) y, cuando corresponde, el número de la boleta.</li>
          <li><strong>Barberos:</strong> quienes se registran como barberos entregan además nombre profesional, especialidad, celular, correo, fotos de perfil, una descripción y, si atienden a domicilio, su zona de cobertura.</li>
          <li><strong>Datos técnicos:</strong> una cookie de sesión (ver la sección de cookies) y los registros técnicos del servidor y de los correos enviados.</li>
        </ul>
      </Section>

      <Section id="finalidad" title="3. Para qué los usamos">
        <ul className="lg-list">
          <li>Crear y administrar tu cuenta e iniciar sesión.</li>
          <li>Agendar, confirmar, reprogramar o cancelar tus citas y avisarte por correo de cada cambio.</li>
          <li>Que el barbero que te atiende y la administración del local vean los datos necesarios para tu cita (nombre, celular, servicio, horario y, si corresponde, la dirección).</li>
          <li>Procesar pagos en línea, reembolsos y la rendición contable y tributaria del local.</li>
          <li>Revisar y aprobar los perfiles de los barberos.</li>
          <li>Seguridad: evitar abusos (por ejemplo, limitar intentos de inicio de sesión) y mantener un registro de las acciones de administración.</li>
        </ul>
        <p>No vendemos tus datos ni los usamos para publicidad.</p>
      </Section>

      <Section id="terceros" title="4. Con quién los compartimos">
        <p>Solo con proveedores que necesitamos para que el servicio funcione:</p>
        <ul className="lg-list">
          <li><strong>MongoDB Atlas</strong> (base de datos en la nube), donde se guardan la cuenta, las citas y los pagos.</li>
          <li><strong>Render</strong> (alojamiento del servidor, en Estados Unidos).</li>
          <li><strong>GitHub Pages</strong> (alojamiento de las páginas del sitio).</li>
          <li><strong>Resend</strong> (envío de correos: confirmación de cuenta, recuperación de contraseña y avisos de citas).</li>
          <li><strong>Mercado Pago</strong> (pagos en línea): recibe el monto, el detalle de la cita y tu correo para el comprobante.</li>
          <li><strong>Meta (Facebook)</strong>, solo si eliges iniciar sesión con Facebook.</li>
          <li><strong>Google</strong>, solo si eliges iniciar sesión con Google.</li>
          <li><strong>OpenStreetMap (Nominatim)</strong>, para ubicar la dirección de una atención a domicilio (se envía solo la calle y la comuna).</li>
          <li><strong>Google Fonts</strong>, que entrega las tipografías del sitio (tu navegador se conecta a Google para descargarlas).</li>
        </ul>
        <p>
          Algunos de estos proveedores procesan los datos fuera de Chile (principalmente en Estados Unidos). Además,
          podemos entregar datos cuando una ley o una autoridad competente lo exija.
        </p>
      </Section>

      <Section id="cookies" title="5. Cookies">
        <p>
          Usamos una sola cookie propia, <code>ws_session</code>, que mantiene tu sesión iniciada (es <em>httpOnly</em>,
          dura hasta 30 días y se borra al cerrar sesión). Al entrar con Facebook o con Google se usa además una cookie
          temporal de seguridad (<code>ws_fb_nonce</code> o <code>ws_gg_nonce</code>, 10 minutos). No usamos cookies de publicidad ni de analítica. La agenda
          guarda en tu navegador (almacenamiento de sesión) la selección de la reserva en curso, que se borra al cerrar
          la pestaña.
        </p>
      </Section>

      <Section id="conservacion" title="6. Cuánto tiempo los guardamos">
        <ul className="lg-list">
          <li>Los datos de tu cuenta, mientras la cuenta exista.</li>
          <li>Las sesiones vencen a los 30 días; los links de confirmación y de recuperación de contraseña vencen en 24 horas y 1 hora.</li>
          <li>Al eliminar tu cuenta se borran tu nombre, correo, celular y formas de inicio de sesión, y se cancelan tus citas futuras. Las citas pasadas y sus pagos se conservan sin tus datos personales (como «Cliente eliminado»), porque el local los necesita para su contabilidad y sus obligaciones tributarias.</li>
          <li>Los registros técnicos de correos enviados y de seguridad se conservan solo el tiempo necesario para operar y resolver problemas.</li>
        </ul>
      </Section>

      <Section id="derechos" title="7. Tus derechos">
        <p>
          Puedes pedir en cualquier momento acceso a tus datos, su rectificación o actualización, su eliminación
          (supresión), y oponerte a su tratamiento o pedir su bloqueo. Con la entrada en vigencia de la Ley N° 21.719
          también podrás pedir la portabilidad de tus datos. Puedes corregir tu nombre y celular desde{' '}
          <a href="/wstyle/cuenta/">Mi cuenta</a>; para lo demás, escríbenos por el formulario de{' '}
          <a href={OPERATOR_CONTACT_URL} target="_blank" rel="noopener">ricorp.cl/contacto</a> indicando el correo de tu
          cuenta. Responderemos dentro de los plazos legales. Si no quedas conforme, puedes reclamar ante la autoridad
          competente en Chile.
        </p>
      </Section>

      <Section id="eliminar-cuenta" title="8. Cómo eliminar tu cuenta">
        <ol className="lg-list">
          <li>Inicia sesión y entra a <a href="/wstyle/cuenta/">Mi cuenta</a> (ricorp.cl/wstyle/cuenta/).</li>
          <li>Abre «Eliminar mi cuenta» y pulsa «Quiero eliminarla».</li>
          <li>Confirma con «Sí, eliminar mi cuenta».</li>
        </ol>
        <p>
          La eliminación es inmediata y no se puede deshacer: se borran tus datos personales, se cierran tus sesiones,
          se cancelan tus citas futuras (si alguna estaba pagada en línea, se reembolsa) y las pasadas quedan como
          «Cliente eliminado».
        </p>
      </Section>

      <Section id={DATA_DELETION_ANCHOR} title="9. Eliminar los datos de Facebook">
        <p>Si iniciaste sesión con Facebook, puedes eliminar tus datos de cualquiera de estas formas:</p>
        <ol className="lg-list">
          <li><strong>Desde WS Style:</strong> elimina tu cuenta como se explica en el punto anterior. Se borra también el vínculo con tu cuenta de Facebook.</li>
          <li>
            <strong>Desde Facebook:</strong> en Facebook entra a <em>Configuración y privacidad → Configuración → Apps y sitios web</em>,
            busca «WS Style», pulsa <em>Eliminar</em> y marca la opción para pedir que se borren tus datos. Facebook nos
            envía una solicitud de eliminación firmada; al recibirla eliminamos tu cuenta automáticamente, igual que en
            el punto anterior, y Facebook te muestra un código de confirmación y un link para verificar que la
            eliminación se realizó.
          </li>
          <li><strong>Por escrito:</strong> pídelo en <a href={OPERATOR_CONTACT_URL} target="_blank" rel="noopener">ricorp.cl/contacto</a> indicando el correo con que entraste.</li>
        </ol>
        <p>
          <strong>Si entraste con Google:</strong> elimina tu cuenta desde <a href="/wstyle/cuenta/">Mi cuenta</a> (se borra
          también el vínculo con Google) y, si quieres, quita el acceso de «WS Style» en{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.
          No guardamos tokens de Google, así que al quitar el acceso no queda ninguna conexión activa con tu cuenta.
        </p>
      </Section>

      <Section id="seguridad" title="10. Seguridad">
        <p>
          Las conexiones van cifradas (HTTPS), las contraseñas y los tokens de sesión se guardan solo como hash y el
          acceso a los datos está limitado por rol (cliente, barbero o administrador). Ningún sistema es infalible: si
          detectamos un incidente que afecte tus datos, te avisaremos cuando corresponda.
        </p>
      </Section>

      <Section id="menores" title="11. Menores de edad">
        <p>La agenda está pensada para personas adultas. Si eres menor de edad, úsala con autorización de tu madre, padre o tutor.</p>
      </Section>

      <Section id="cambios" title="12. Cambios a esta política">
        <p>Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha de actualización. Revisa también los <a href={TERMS_URL}>Términos y condiciones</a>.</p>
      </Section>
    </LegalShell>
  );
}

export function TermsPage({ site }: { site: SiteContent }) {
  const name = str(site.name) ?? 'WS Style';
  const policies = (site.policies ?? []).filter((p) => p && str(p.title) && str(p.text));
  return (
    <LegalShell current="terminos" title="Términos y condiciones">
      <p>
        Estos términos rigen el uso del sitio de {name} (ricorp.cl/wstyle/) y su agenda en línea, operados por{' '}
        {OPERATOR} (<a href={OPERATOR_URL} target="_blank" rel="noopener">ricorp.cl</a>). Al crear una cuenta o reservar
        una hora los aceptas, junto con la <a href={PRIVACY_URL}>Política de privacidad</a>.
      </p>

      <Section id="cuenta" title="1. Tu cuenta">
        <p>
          Para reservar necesitas una cuenta con correo y contraseña, con Facebook o con Google, y un celular de contacto. Debes
          entregar datos verdaderos y cuidar el acceso a tu cuenta. Puedes eliminarla cuando quieras desde{' '}
          <a href="/wstyle/cuenta/">Mi cuenta</a>.
        </p>
      </Section>

      <Section id="reservas" title="2. Reservas">
        <ul className="lg-list">
          <li>Eliges el servicio, el barbero (o el primero disponible), el lugar (el local o, si el barbero lo ofrece, tu domicilio) y el horario. Los precios y duraciones son los que muestra la agenda al reservar.</li>
          <li>Cada cita queda pendiente hasta que el barbero la confirma; si no la confirma a tiempo, vence y la hora se libera. Te avisamos por correo de cada cambio.</li>
          <li>El barbero puede proponerte otro horario; tú decides si lo aceptas.</li>
          <li>La agenda puede limitar cuántas horas activas tienes a la vez.</li>
          <li>La atención a domicilio puede tener un recargo y solo está disponible dentro de la zona que cubre cada barbero.</li>
        </ul>
      </Section>

      <Section id="politicas-del-local" title="3. Políticas del local">
        {policies.length ? (
          <dl className="lg-policies">
            {policies.map((p, i) => <div key={i}><dt>{p.title}</dt><dd>{p.text}</dd></div>)}
          </dl>
        ) : <p>Las políticas de atrasos, inasistencias y pagos del local se publican en la página de {name}.</p>}
      </Section>

      <Section id="cancelaciones" title="4. Cancelaciones e inasistencias">
        <p>
          Puedes cancelar en línea desde <a href="/wstyle/cuenta/mis-citas/">Mis citas</a> hasta el plazo que indica la
          agenda antes de la hora. Pasado ese plazo, avisa al local por WhatsApp. Si no te presentas, la cita queda
          registrada como inasistencia. El local o el barbero también pueden cancelar una cita, y te avisaremos por correo.
        </p>
      </Section>

      <Section id="pagos" title="5. Pagos, reembolsos y boletas">
        <ul className="lg-list">
          <li>Según lo que tenga habilitado el local, pagas en el local o en línea con <strong>Mercado Pago</strong>. El pago en línea se hace en Mercado Pago, sujeto a sus propios términos; nunca vemos ni guardamos los datos de tu tarjeta.</li>
          <li>Si eliges pagar en línea, la hora se reserva por unos minutos mientras completas el pago; si no se completa, la hora se libera.</li>
          <li>Si una cita pagada en línea se cancela dentro del plazo (por ti, por el barbero o por el local), o eliminas tu cuenta con una cita futura pagada, el pago se reembolsa a través de Mercado Pago al mismo medio de pago. Los plazos de devolución dependen de Mercado Pago y de tu banco.</li>
          <li>El respaldo tributario de cada venta lo emite el local: en los pagos con Mercado Pago, el comprobante de Mercado Pago o una boleta, y en los pagos en el local, la boleta correspondiente.</li>
        </ul>
      </Section>

      <Section id="barberos" title="6. Barberos">
        <p>
          Los barberos que aparecen en la agenda son profesionales independientes que se registran en el sitio y que
          la administración del local revisa y aprueba antes de publicarlos. Cada barbero es responsable del servicio
          que presta y de mantener al día su disponibilidad. La administración puede suspender o rechazar perfiles.
          Quien se registra como barbero acepta además mantener sus datos y fotos actualizados y usar los datos de
          los clientes solo para atender sus citas.
        </p>
      </Section>

      <Section id="uso" title="7. Uso aceptable y disponibilidad">
        <p>
          No uses la agenda para reservar horas que no piensas usar, suplantar a otra persona ni intentar acceder a
          datos de terceros. Podemos suspender cuentas que lo hagan. Hacemos lo posible para que el sitio funcione sin
          interrupciones, pero puede haber caídas o mantenciones; ante cualquier problema con tu hora, contacta al local.
        </p>
      </Section>

      <Section id="contacto" title="8. Contacto">
        <BusinessContact site={site} />
      </Section>

      <Section id="ley" title="9. Ley aplicable y cambios">
        <p>
          Estos términos se rigen por las leyes de Chile, incluida la Ley N° 19.496 sobre protección de los derechos de
          los consumidores. Si los cambiamos, publicaremos la nueva versión en esta página con su fecha de actualización.
        </p>
      </Section>
    </LegalShell>
  );
}

export function LegalPage({ kind, site }: { kind: LegalKind; site: SiteContent }) {
  return kind === 'privacidad' ? <PrivacyPage site={site} /> : <TermsPage site={site} />;
}
