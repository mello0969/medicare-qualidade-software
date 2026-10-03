import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle,
  CaretLeft,
  Heart,
  Smiley,
  SmileyMeh,
  SmileySad,
  ShieldCheck,
} from '@phosphor-icons/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  SECTORS,
  isSector,
  sectorName,
  questionsForSectors,
  DEFAULT_SETTINGS,
  type SurveySettings,
  type SurveySubmission,
  type SectorId,
  type Question,
  type Shift,
} from './domain';
import { loadQuestions, saveResponse } from './storage';
import { getQuestions, getSettings, submitResponse } from './api';
import { useAuth } from './Auth';
import Brand from './Brand';

gsap.registerPlugin(useGSAP);
const labels = ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Muito bom'];
const Faces = [SmileySad, SmileySad, SmileyMeh, Smiley, Smiley];

export default function Survey({
  sector,
  localMode = false,
}: {
  sector?: string;
  localMode?: boolean;
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<SectorId[]>(isSector(sector) ? [sector] : []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(-1);
  const [values, setValues] = useState<Record<string, number>>({});
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [shift, setShift] = useState<Shift>('nao-informado');
  const [doctor, setDoctor] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [settings, setSettings] = useState<SurveySettings>(DEFAULT_SETTINGS);
  const [wantsContact, setWantsContact] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', email: '', message: '' });
  const [consent, setConsent] = useState(false);
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const errorNode = useRef<HTMLParagraphElement>(null);
  const pending = useRef(false);
  const lowRating = questions.some(
    (question) => values[question.id] === 1 || values[question.id] === 2,
  );
  const id = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const success = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const count = questions.length + 2;
  const question = questions[step];
  useEffect(() => {
    if (started.current) heading.current?.focus();
    started.current = true;
  }, [step, done]);
  useGSAP(
    () => {
      if (done && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.fromTo(
          '.success-icon',
          { scale: 0.9 },
          { scale: 1, duration: 0.24, ease: 'power2.out' },
        );
      }
    },
    { scope: success, dependencies: [done], revertOnUpdate: true },
  );

  async function start() {
    if (starting) return;
    if (!selected.length) {
      setError('Selecione pelo menos um setor por onde você passou.');
      return;
    }
    setStarting(true);
    try {
      const [list, messages] = localMode
        ? [loadQuestions(), DEFAULT_SETTINGS]
        : await Promise.all([getQuestions(), getSettings()]);
      setQuestions(questionsForSectors(list, selected));
      setSettings(messages);
      setConsent(false);
      setError('');
      setStep(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }
  function next() {
    if (question && values[question.id] === undefined) {
      setError('Escolha uma nota ou use “Pular pergunta”.');
      return;
    }
    if (step === questions.length && nps === null) {
      setError('Escolha uma nota de 0 a 10. A recomendação é obrigatória.');
      return;
    }
    setError('');
    setStep((s) => s + 1);
  }
  async function submit() {
    if (pending.current || done) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const response: SurveySubmission = {
        id: id.current,
        createdAt: new Date().toISOString(),
        sectorIds: selected,
        answers: questions
          .filter((q) => values[q.id] > 0)
          .map((q) => ({
            questionId: q.id,
            questionText: q.text,
            questionVersion: q.version,
            sectorId: q.sectorId,
            value: values[q.id],
          })),
        nps,
        comment: comment.trim(),
        shift,
        doctor: doctor.trim(),
        ...(lowRating && wantsContact && !localMode
          ? {
              contactRequest: {
                ...(Object.fromEntries(
                  Object.entries(contact).map(([key, value]) => [key, value.trim()]),
                ) as typeof contact),
                consent: true,
                settingsVersion: settings.version,
              },
            }
          : {}),
      };
      if (localMode) saveResponse(response);
      else await submitResponse(response);
      confirmationDialog.current?.close();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
      pending.current = false;
    }
  }
  function review() {
    let problem = '';
    if (nps === null) problem = 'Escolha a nota de recomendação antes de enviar.';
    if (lowRating && wantsContact && !localMode) {
      if (contact.name.trim().length < 2)
        problem = 'Informe um nome para contato com pelo menos 2 caracteres.';
      else if (
        !/^[+\d()\s-]{8,20}$/.test(contact.phone.trim()) ||
        contact.phone.replace(/\D/g, '').length < 8
      )
        problem = 'Informe um telefone válido para contato.';
      else if (contact.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()))
        problem = 'Confira o e-mail para contato ou deixe-o em branco.';
      else if (contact.message.trim().length < 10)
        problem = 'Conte o que aconteceu usando pelo menos 10 caracteres.';
      else if (!consent)
        problem = 'Autorize o uso dos dados para contato ou desmarque o pedido de contato.';
    }
    setError(problem);
    if (problem) {
      requestAnimationFrame(() => errorNode.current?.focus());
      return;
    }
    confirmationDialog.current?.showModal();
  }

  if (sector && !isSector(sector))
    return (
      <main className="simple-page">
        <h1>Setor não encontrado</h1>
        <p>Confira o endereço ou escolha um setor na pesquisa.</p>
        <a className="button primary" href="#/pesquisa">
          Escolher setor
        </a>
      </main>
    );

  return (
    <div className="survey-shell">
      <aside className="survey-aside">
        <Brand className="light" />
        <div className="survey-intro">
          <Heart size={42} weight="light" aria-hidden="true" />
          <h2>Ouvir você faz parte do cuidado.</h2>
          <p>Sua experiência ajuda a entender o que funciona e o que pode melhorar.</p>
        </div>
        <div className="aside-note">
          <ShieldCheck size={22} aria-hidden="true" />
          <p>
            A avaliação pode ser anônima. Dados de contato são opcionais e exigem sua autorização.
          </p>
        </div>
        <span className="aside-project">Projeto acadêmico · versão de demonstração</span>
      </aside>
      <main className="survey-main" id="conteudo">
        <div className="survey-top">
          <a className="text-link" href="#/">
            <CaretLeft aria-hidden="true" /> Página inicial
          </a>
          <span>Pesquisa de satisfação</span>
        </div>
        <div className="survey-content" ref={success}>
          {!done && (
            <div className="survey-progress">
              <div className="progress-label">
                <span>{step < 0 ? 'Vamos começar' : `Etapa ${step + 1} de ${count}`}</span>
                <span>{sector ? sectorName(sector) : 'Sua experiência'}</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Progresso da pesquisa"
                aria-valuemin={0}
                aria-valuemax={count}
                aria-valuenow={Math.max(0, step + 1)}
              >
                <span style={{ width: `${(Math.max(0, step + 1) / count) * 100}%` }} />
              </div>
            </div>
          )}
          {done ? (
            <div className="success-state">
              <CheckCircle className="success-icon" size={76} weight="light" aria-hidden="true" />
              <h1 ref={heading} tabIndex={-1}>
                Obrigado por compartilhar.
              </h1>
              <p>{localMode ? 'Sua resposta foi salva neste navegador.' : settings.successText}</p>
              <p className="muted">
                Esta é uma demonstração acadêmica. A resposta e qualquer pedido de contato não foram
                enviados à FHDOD.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setDone(false);
                  setStep(-1);
                  setValues({});
                  setNps(null);
                  setComment('');
                  setShift('nao-informado');
                  setDoctor('');
                  setWantsContact(false);
                  setConsent(false);
                  setContact({ name: '', phone: '', email: '', message: '' });
                  id.current = crypto.randomUUID();
                }}
              >
                Iniciar outra pesquisa
              </button>
              {(localMode || user) && (
                <a
                  className="text-link"
                  href={localMode ? '#/painel?dados=locais&modo=local' : '#/painel?dados=servidor'}
                >
                  Ver a resposta no painel
                </a>
              )}
            </div>
          ) : (
            <>
              {step < 0 ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    {sector
                      ? `Vamos falar sobre ${sector === 'medico' ? 'o atendimento médico' : sector === 'raio-x' ? 'o Raio X' : `a ${sectorName(sector).toLowerCase()}`}?`
                      : 'Por onde você passou?'}
                  </h1>
                  <p className="survey-description">
                    {sector
                      ? 'Primeiro, perguntas específicas do setor; depois, perguntas gerais. Você pode pular avaliações. A nota de recomendação é obrigatória.'
                      : 'Selecione os setores do seu atendimento. As perguntas específicas vêm primeiro, seguidas das gerais e da recomendação obrigatória.'}
                  </p>
                  <fieldset className="sector-choices">
                    <legend className="sr-only">Setores utilizados</legend>
                    {SECTORS.filter((s) => !sector || s.id === sector).map((s) => (
                      <label
                        className={`sector-choice ${selected.includes(s.id) ? 'selected' : ''}`}
                        key={s.id}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, s.id]
                                : selected.filter((id) => id !== s.id),
                            );
                            setError('');
                          }}
                        />
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.description}</small>
                        </span>
                        <Check className="choice-check" aria-hidden="true" />
                      </label>
                    ))}
                  </fieldset>
                  <div className="privacy-note">
                    <ShieldCheck size={20} aria-hidden="true" />
                    <span>
                      Use somente informações fictícias nesta versão.{' '}
                      {localMode
                        ? 'As respostas ficam neste navegador.'
                        : 'As respostas são reunidas no painel, acessível à equipe responsável.'}
                    </span>
                  </div>
                  <button className="button primary wide" onClick={start} disabled={starting}>
                    {starting ? 'Preparando pesquisa…' : 'Começar pesquisa'}
                  </button>
                </>
              ) : question ? (
                <>
                  <span className="step-context">{sectorName(question.sectorId)}</span>
                  <h1 ref={heading} tabIndex={-1}>
                    {question.text}
                  </h1>
                  <p className="survey-description">
                    Escolha a opção que melhor representa sua experiência.
                  </p>
                  <fieldset className="rating-options">
                    <legend className="sr-only">Nota de 1 a 5</legend>
                    {labels.map((label, i) => {
                      const Face = Faces[i];
                      return (
                        <label
                          className={`rating-option rating-${i + 1} ${values[question.id] === i + 1 ? 'selected' : ''}`}
                          key={label}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={i + 1}
                            checked={values[question.id] === i + 1}
                            onChange={() => {
                              setValues({ ...values, [question.id]: i + 1 });
                              setError('');
                            }}
                          />
                          <Face
                            size={46}
                            weight={values[question.id] === i + 1 ? 'fill' : 'regular'}
                            aria-hidden="true"
                          />
                          <strong>{i + 1}</strong>
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                  <button
                    className="survey-skip"
                    onClick={() => {
                      setValues({ ...values, [question.id]: 0 });
                      setError('');
                      setStep((s) => s + 1);
                    }}
                  >
                    Pular pergunta
                  </button>
                </>
              ) : step === questions.length ? (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Você recomendaria o Hospital Dr. Oswaldo Diesel a um familiar?
                  </h1>
                  <p className="survey-description">
                    De 0 a 10, qual seria a chance de você recomendar? Esta pergunta é obrigatória.
                  </p>
                  <fieldset className="nps-options">
                    <legend className="sr-only">Chance de recomendar de 0 a 10</legend>
                    {Array.from({ length: 11 }, (_, value) => (
                      <label className={nps === value ? 'selected' : ''} key={value}>
                        <input
                          type="radio"
                          name="nps"
                          checked={nps === value}
                          onChange={() => setNps(value)}
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="nps-captions">
                    <span>0 · Não recomendaria</span>
                    <span>10 · Recomendaria muito</span>
                  </div>
                </>
              ) : (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Quer nos contar algo mais?
                  </h1>
                  <p className="survey-description">
                    Um elogio ou uma sugestão faz diferença. Esta etapa é opcional.
                  </p>
                  <label className="field-label" htmlFor="comment">
                    Seu comentário
                  </label>
                  <textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={600}
                    disabled={saving}
                    rows={4}
                    placeholder="Conte como foi sua experiência. Não inclua nomes ou informações de saúde."
                  />
                  <span className="character-count">{comment.length}/600</span>
                  <details className="extra-context">
                    <summary>Identificar o atendimento (opcional)</summary>
                    <p>Use códigos fictícios para experimentar os filtros do painel.</p>
                    <div className="field-grid">
                      <label>
                        Plantão
                        <select
                          value={shift}
                          onChange={(e) => setShift(e.target.value as Shift)}
                          disabled={saving}
                        >
                          <option value="nao-informado">Não sei informar</option>
                          <option value="par">Par</option>
                          <option value="impar">Ímpar</option>
                        </select>
                      </label>
                      <label>
                        Código do profissional
                        <input
                          value={doctor}
                          onChange={(e) => setDoctor(e.target.value)}
                          maxLength={40}
                          disabled={saving}
                          placeholder="Ex.: Profissional A"
                        />
                      </label>
                    </div>
                  </details>
                  {lowRating && !localMode && (
                    <section className="contact-opt-in" aria-labelledby="contact-heading">
                      <h2 id="contact-heading">Podemos ouvir você com mais atenção?</h2>
                      <p>{settings.contactPrompt}</p>
                      <label className="contact-checkbox">
                        <input
                          type="checkbox"
                          checked={wantsContact}
                          disabled={saving}
                          onChange={(e) => {
                            setWantsContact(e.target.checked);
                            setConsent(false);
                            setError('');
                          }}
                        />
                        Quero receber contato da ouvidoria
                      </label>
                      {wantsContact && (
                        <div className="contact-fields">
                          <p className="academic-disclaimer">
                            Use dados fictícios. Este pedido ficará apenas no projeto acadêmico e
                            não será enviado ao hospital.
                          </p>
                          <label>
                            Nome para contato
                            <input
                              autoComplete="name"
                              maxLength={80}
                              value={contact.name}
                              disabled={saving}
                              onChange={(e) => setContact({ ...contact, name: e.target.value })}
                            />
                          </label>
                          <label>
                            Telefone para contato
                            <input
                              type="tel"
                              autoComplete="tel"
                              maxLength={20}
                              value={contact.phone}
                              disabled={saving}
                              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                            />
                          </label>
                          <label>
                            E-mail para contato (opcional)
                            <input
                              type="email"
                              autoComplete="email"
                              maxLength={254}
                              value={contact.email}
                              disabled={saving}
                              onChange={(e) => setContact({ ...contact, email: e.target.value })}
                            />
                          </label>
                          <label>
                            Conte o que aconteceu
                            <textarea
                              rows={4}
                              maxLength={1200}
                              value={contact.message}
                              disabled={saving}
                              onChange={(e) => setContact({ ...contact, message: e.target.value })}
                            />
                          </label>
                          <label className="contact-checkbox">
                            <input
                              type="checkbox"
                              checked={consent}
                              disabled={saving}
                              onChange={(e) => setConsent(e.target.checked)}
                            />
                            {settings.contactConsent}
                          </label>
                        </div>
                      )}
                    </section>
                  )}
                  {lowRating && localMode && (
                    <p className="muted small">
                      O modo local não registra pedidos de contato. Use a pesquisa conectada para
                      experimentar a ouvidoria com dados fictícios.
                    </p>
                  )}
                </>
              )}
              {error && (
                <p className="error-message" role="alert" ref={errorNode} tabIndex={-1}>
                  {error}
                </p>
              )}
              {step >= 0 && (
                <div className="survey-actions">
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => {
                      setError('');
                      setStep((s) => s - 1);
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    className="button primary"
                    onClick={step === questions.length + 1 ? review : next}
                    disabled={saving}
                  >
                    {saving
                      ? 'Salvando…'
                      : step === questions.length + 1
                        ? 'Concluir pesquisa'
                        : 'Continuar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <dialog
          className="confirmation-dialog"
          ref={confirmationDialog}
          aria-labelledby="confirm-heading"
          onCancel={(e) => {
            if (saving) e.preventDefault();
          }}
        >
          <h2 id="confirm-heading">Confirmar suas respostas</h2>
          <p>{settings.confirmationText}</p>
          <dl>
            <dt>Avaliações respondidas</dt>
            <dd>{questions.filter((question) => values[question.id] > 0).length}</dd>
            <dt>Nota de recomendação</dt>
            <dd>{nps ?? '—'} / 10</dd>
            <dt>Pedido de contato</dt>
            <dd>{lowRating && wantsContact && !localMode ? 'Autorizado' : 'Não solicitado'}</dd>
          </dl>
          <p className="academic-disclaimer">
            Os registros ficam neste protótipo acadêmico. Não serão enviados ao hospital.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="survey-actions">
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => confirmationDialog.current?.close()}
            >
              Voltar e revisar
            </button>
            <button className="button primary" disabled={saving} onClick={() => void submit()}>
              {saving ? 'Enviando…' : 'Confirmar envio'}
            </button>
          </div>
        </dialog>
        <footer className="survey-footer">FHDOD · Três Coroas/RS · Protótipo acadêmico</footer>
      </main>
    </div>
  );
}
