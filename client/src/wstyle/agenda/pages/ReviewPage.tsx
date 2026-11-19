import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { agenda, ApiError, isNetwork, type ReviewEligibility } from '../api';
import type { AgendaCtx } from '../ctx';
import AuthPanel from '../components/AuthPanel';
import Shell from '../components/Shell';
import { Notice, Spinner, Unavailable } from '../components/ui';
import { charCount, COMMENT_MAX, COMMENT_MIN, reviewDate, starsLabel, starsText } from '../../reviews';

const STAR_HINT = ['', 'Mala', 'Regular', 'Buena', 'Muy buena', 'Excelente'];

// /wstyle/cuenta/resena/?cita=… (SPEC-52): el cliente dueño de una cita atendida deja 1–5 estrellas y un comentario.
// Se publica al instante. Sin sesión pide entrar y vuelve acá; cita ajena → 404; plazo vencido → aviso.
export default function ReviewPage({ ctx }: { ctx: AgendaCtx }) {
  const { session, whatsapp, fbReturn } = ctx;
  const user = session.user;
  const cita = new URLSearchParams(location.search).get('cita') ?? '';
  const [info, setInfo] = useState<ReviewEligibility | null>(null);
  const [loadErr, setLoadErr] = useState<ApiError | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user || !cita) return;
    let alive = true;
    agenda.reviewEligibility(cita).then(
      (d) => { if (alive) setInfo(d); },
      (e) => { if (alive) setLoadErr(e instanceof ApiError ? e : new ApiError(0, 'network', 'Sin conexión')); },
    );
    return () => { alive = false; };
  }, [user, cita]);

  const shell = (children: ReactNode) => <Shell user={user} current="mis-citas">{children}</Shell>;
  if (session.status === 'loading') return shell(<Spinner label="Cargando…" />);
  if (session.status === 'offline' || (loadErr && isNetwork(loadErr))) return shell(<Unavailable whatsapp={whatsapp} onRetry={() => location.reload()} />);
  if (!user) {
    return shell(
      <>
        <h1 className="ag-h1">Deja tu reseña</h1>
        <div className="ag-card ag-narrow">
          <p>Entra con la cuenta con la que reservaste para contar cómo te fue.</p>
          <AuthPanel facebook={session.facebook} google={session.google} returnTo={location.pathname + location.search} fbReturn={fbReturn} onAuthed={(u) => session.setUser(u)} />
        </div>
      </>,
    );
  }

  const toMine = <a className="btn btn--ghost" href="/wstyle/cuenta/mis-citas/">Ir a Mis citas</a>;
  if (!cita || loadErr) {
    return shell(
      <>
        <h1 className="ag-h1">Deja tu reseña</h1>
        <div className="ag-card ag-narrow" data-state="not-found">
          <Notice tone="error">{loadErr?.status === 404 || !cita ? 'No encontramos esa cita en tu cuenta.' : loadErr?.message}</Notice>
          <div className="ag-actions">{toMine}</div>
        </div>
      </>,
    );
  }
  if (!info) return shell(<Spinner label="Cargando tu cita…" />);

  const a = info.appointment;
  const head = (
    <p className="ag-review__appt" data-appointment="">
      <strong>{a.service}</strong>{a.professional && <> · con {a.professional}</>} · {reviewDate(a.startsAt)}
    </p>
  );

  if (done || info.state === 'reviewed') {
    const r = done ? rating : info.review?.rating ?? 0;
    return shell(
      <>
        <h1 className="ag-h1">{done ? '¡Gracias!' : 'Tu reseña'}</h1>
        <div className="ag-card ag-narrow" data-state="thanks">
          {head}
          <Notice tone="ok">{done ? '¡Gracias! Tu reseña ya está publicada.' : 'Ya dejaste una reseña para esta cita.'}</Notice>
          {r > 0 && <p className="ag-review__mine" aria-label={starsLabel(r)}>Tu reseña: <span aria-hidden="true">{starsText(r)}</span></p>}
          <div className="ag-actions ag-actions--wrap">
            <a className="btn btn--primary" href="/wstyle/#resenas">Ver las reseñas en el inicio</a>
            {toMine}
          </div>
        </div>
      </>,
    );
  }
  if (info.state === 'expired' || info.state === 'not_attended') {
    return shell(
      <>
        <h1 className="ag-h1">Deja tu reseña</h1>
        <div className="ag-card ag-narrow" data-state={info.state}>
          {head}
          <Notice tone="info">{info.state === 'expired' ? 'El plazo para reseñar esta cita terminó.' : 'Solo puedes reseñar una cita atendida.'}</Notice>
          <div className="ag-actions">{toMine}</div>
        </div>
      </>,
    );
  }

  // Como el server: espacios colapsados y bordes recortados (las etiquetas HTML las quita el server).
  const n = charCount(comment.replace(/\s+/g, ' ').trim());
  const tooLong = n > COMMENT_MAX;
  const tooShort = n < COMMENT_MIN;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!rating) return setError('Elige de 1 a 5 estrellas.');
    if (tooShort) return setError(`Cuéntanos un poco más (mínimo ${COMMENT_MIN} caracteres).`);
    if (tooLong) return setError(`El comentario puede tener hasta ${COMMENT_MAX} caracteres.`);
    setSending(true);
    setError(null);
    try {
      await agenda.createReview({ appointmentId: a.id, rating, comment });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_reviewed') {
        setInfo({ ...info!, state: 'reviewed', review: { rating, comment, createdAt: new Date().toISOString() } });
      } else setError(err instanceof ApiError && err.status ? err.message : 'No pudimos publicar tu reseña. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return shell(
    <>
      <h1 className="ag-h1">Deja tu reseña</h1>
      <form className="ag-card ag-narrow ag-review" onSubmit={submit} noValidate data-state="open">
        {head}
        <fieldset className="ag-stars">
          <legend>¿Cómo te fue?</legend>
          <div className="ag-stars__row">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="ag-stars__item">
                <input className="ag-sr" type="radio" id={`rating-${i}`} name="rating" value={i} checked={rating === i} onChange={() => { setRating(i); setError(null); }} />
                <label htmlFor={`rating-${i}`} className={i <= rating ? 'is-on' : ''}>
                  <span aria-hidden="true">★</span>
                  <span className="ag-sr">{starsLabel(i)}</span>
                </label>
              </span>
            ))}
          </div>
          <p className="ag-field__hint" aria-live="polite">{rating ? `${STAR_HINT[rating]} · ${starsLabel(rating)}` : 'Elige de 1 a 5 estrellas.'}</p>
        </fieldset>
        <div className={`ag-field${tooLong ? ' has-error' : ''}`}>
          <label htmlFor="review-comment">Tu comentario</label>
          <textarea id="review-comment" rows={5} value={comment} onChange={(e) => { setComment(e.target.value); setError(null); }}
            placeholder="¿Qué te pareció el corte y la atención?" aria-describedby="review-count" aria-invalid={tooLong || undefined} />
          <p id="review-count" className={`ag-field__hint ag-review__count${tooLong ? ' is-over' : ''}`} aria-live="polite">
            {n} / {COMMENT_MAX}{tooLong ? ` · te pasaste por ${n - COMMENT_MAX}` : tooShort ? ` · mínimo ${COMMENT_MIN}` : ''}
          </p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="ag-actions">
          <button type="submit" className="btn btn--primary" disabled={sending || tooLong} aria-busy={sending || undefined}>{sending ? 'Publicando…' : 'Publicar reseña'}</button>
        </div>
        <p className="ag-fine">Se publica en el inicio de WS Style con tu nombre de pila y la inicial de tu apellido.</p>
      </form>
    </>,
  );
}
