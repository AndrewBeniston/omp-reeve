"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { ExtensionUiRequest } from "@/lib/types";
import { normalizeCustomPanelLines, parseAnsiLine } from "@/lib/ansi";
import { asBracketedPaste, toTerminalKeyData } from "@/lib/terminal-input";
import { MarkdownBody } from "../MarkdownBody";
import { AnsiSegment } from "../ui/AnsiSegment";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useI18n } from "@/hooks/useI18n";
import styles from "./chat-window.module.css";

export type ExtensionDialogRequest = Extract<
  ExtensionUiRequest,
  { method: "select" | "confirm" | "input" | "editor" | "ask" | "plan_review" }
>;

export function ExtensionDialog({
  request,
  onRespond,
}: {
  request: ExtensionDialogRequest;
  onRespond: (request: ExtensionDialogRequest, response: { value: string } | { confirmed: boolean } | { cancelled: true }) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(request.method === "editor" ? request.prefill ?? "" : "");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [planFeedback, setPlanFeedback] = useState("");

  useEffect(() => {
    setValue(request.method === "editor" ? request.prefill ?? "" : "");
    setPlanFeedback("");
    setCustomAnswers({});
    if (request.method !== "ask") {
      setSelectedOptions({});
      return;
    }
    const recommended: Record<string, number[]> = {};
    for (const question of request.questions) {
      recommended[question.id] = question.recommended !== undefined
        && question.options[question.recommended] !== undefined
        ? [question.recommended]
        : [];
    }
    setSelectedOptions(recommended);
  }, [request]);

  const submitValue = () => {
    if (request.method === "confirm") {
      onRespond(request, { confirmed: true });
    } else {
      onRespond(request, { value });
    }
  };
  if (request.method === "ask") {
    const canSubmit = request.questions.every((question) =>
      (selectedOptions[question.id]?.length ?? 0) > 0
      || (customAnswers[question.id]?.trim().length ?? 0) > 0);
    const toggleOption = (questionId: string, optionIndex: number, multi: boolean) => {
      setSelectedOptions((current) => {
        const selected = current[questionId] ?? [];
        const next = multi
          ? selected.includes(optionIndex)
            ? selected.filter((index) => index !== optionIndex)
            : [...selected, optionIndex]
          : [optionIndex];
        return { ...current, [questionId]: next };
      });
    };
    const submitAnswers = () => {
      if (!canSubmit) return;
      onRespond(request, {
        value: JSON.stringify({
          kind: "submit",
          results: request.questions.map((question) => {
            const customInput = customAnswers[question.id]?.trim();
            return {
              id: question.id,
              question: question.question,
              options: question.options.map((option) => option.label),
              multi: question.multi ?? false,
              selectedOptions: (selectedOptions[question.id] ?? [])
                .map((index) => question.options[index]?.label)
                .filter((option): option is string => option !== undefined),
              ...(customInput ? { customInput } : {}),
            };
          }),
        }),
      });
    };

    return (
      <Dialog
        open
        title={(
          <>
            <span aria-hidden="true" className={styles.questionIcon}>?</span>
            {t("chat.agentQuestion")}
          </>
        )}
        description={t("chat.agentQuestionHint")}
        className={styles.questionDialog}
        onOpenChange={(open) => {
          if (!open) onRespond(request, { cancelled: true });
        }}
      >
          <div className={styles.dialogScrollBody}>
            <div className={styles.questionList}>
              {request.questions.map((question, questionIndex) => {
                const selected = selectedOptions[question.id] ?? [];
                return (
                  <section key={question.id} className={styles.questionCard}>
                    <div className={styles.questionMeta}>
                      {question.header && (
                        <span className={styles.questionHeader}>
                          {question.header}
                        </span>
                      )}
                      {request.questions.length > 1 && (
                        <span className={styles.questionCounter}>
                          {questionIndex + 1}/{request.questions.length}
                        </span>
                      )}
                    </div>
                    <div className={styles.questionText}>
                      {question.question}
                    </div>
                    <div
                      role={question.multi ? "group" : "radiogroup"}
                      aria-label={question.question}
                      className={styles.questionOptions}
                    >
                      {question.options.map((option, optionIndex) => {
                        const checked = selected.includes(optionIndex);
                        const recommended = question.recommended === optionIndex;
                        return (
                          <button
                            key={`${question.id}:${optionIndex}`}
                            type="button"
                            role={question.multi ? "checkbox" : "radio"}
                            aria-checked={checked}
                            onClick={() => toggleOption(question.id, optionIndex, question.multi ?? false)}
                            className={styles.questionOption}
                          >
                            <span
                              aria-hidden="true"
                              className={styles.questionOptionMark}
                              data-multi={question.multi ?? false}
                            >
                              {checked && (question.multi ? (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="2 5.2 4.1 7.2 8 2.8" />
                                </svg>
                              ) : (
                                <span className={styles.questionOptionDot} />
                              ))}
                            </span>
                            <span className={styles.questionOptionContent}>
                              <span className={styles.questionOptionLabel}>{option.label}</span>
                              {option.description && (
                                <span className={styles.questionOptionDescription}>
                                  {option.description}
                                </span>
                              )}
                              {checked && option.preview && (
                                <span className={styles.questionOptionPreview}>
                                  {option.preview}
                                </span>
                              )}
                            </span>
                            {recommended && (
                              <span className={styles.recommendedLabel}>
                                {t("chat.recommended")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      value={customAnswers[question.id] ?? ""}
                      onChange={(event) => setCustomAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitAnswers();
                      }}
                      placeholder={t("chat.customAnswer")}
                      aria-label={t("chat.customAnswer")}
                      className={styles.questionCustomInput}
                    />
                  </section>
                );
              })}
            </div>
          </div>

          <div className={styles.dialogActions}>
            <Button
              size="sm"
              onClick={() => onRespond(request, { cancelled: true })}
            >
              {t("chat.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => onRespond(request, { value: JSON.stringify({ kind: "chat" }) })}
            >
              {t("chat.chatAboutThis")}
            </Button>
            <Button
              tone="primary"
              size="sm"
              disabled={!canSubmit}
              onClick={submitAnswers}
            >
              {t("chat.submitAnswer")}
            </Button>
          </div>
      </Dialog>
    );
  }

  if (request.method === "plan_review") {
    return (
      <Dialog
        open
        // A plan needs an explicit decision, so neither Escape nor the
        // backdrop closes this dialog.
        dismissible={false}
        title={t("chat.planApproval")}
        className={styles.planDialog}
        onOpenChange={() => {}}
      >
          <div className={styles.planHeader}>
            <div className={styles.planTitle}>
              {request.title}
            </div>
            <div className={styles.planPath}>
              {request.planFilePath}
            </div>
          </div>

          <div className={styles.planBody}>
            <MarkdownBody>{request.planContent}</MarkdownBody>
          </div>

          <div className={styles.planFooter}>
            <textarea
              value={planFeedback}
              onChange={(event) => setPlanFeedback(event.target.value)}
              placeholder={t("chat.planFeedback")}
              aria-label={t("chat.planFeedback")}
              className={styles.planFeedback}
            />
            <div className={styles.planActions}>
              <Button
                size="sm"
                onClick={() => onRespond(request, {
                  value: JSON.stringify({ action: "refine", feedback: planFeedback.trim() }),
                })}
              >
                {t("chat.refinePlan")}
              </Button>
              <Button
                tone="primary"
                size="sm"
                onClick={() => onRespond(request, { value: JSON.stringify({ action: "approve" }) })}
              >
                {t("chat.approvePlan")}
              </Button>
            </div>
          </div>
      </Dialog>
    );
  }


  return (
    <Dialog
      open
      title={request.title}
      className={styles.extensionDialog}
      onOpenChange={(open) => {
        if (!open) onRespond(request, { cancelled: true });
      }}
    >
        <div className={styles.extensionDialogHeader}>
          <div className={styles.extensionDialogMeta}>{t("chat.extensionRequest")}</div>
        </div>

        <div className={styles.extensionDialogBody}>
          {request.method === "confirm" && (
            <div className={styles.confirmMessage}>{request.message}</div>
          )}
          {request.method === "select" && (
            <div className={styles.selectOptions}>
              {request.options.map((option) => (
                <Button
                  key={option}
                  size="lg"
                  fullWidth
                  onClick={() => onRespond(request, { value: option })}
                  className={styles.selectOption}
                >
                  {option}
                </Button>
              ))}
            </div>
          )}
          {request.method === "input" && (
            <input
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitValue();
              }}
              className={styles.extensionInput}
            />
          )}
          {request.method === "editor" && (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitValue();
              }}
              className={`${styles.extensionInput} ${styles.extensionEditor}`}
            />
          )}
        </div>

        <div className={styles.dialogActions}>
          <Button
            size="sm"
            onClick={() => onRespond(request, { cancelled: true })}
          >
            {t("chat.cancel")}
          </Button>
          {request.method === "confirm" ? (
            <Button
              tone="primary"
              size="sm"
              onClick={submitValue}
            >
              {t("chat.confirm")}
            </Button>
          ) : request.method !== "select" ? (
            <Button
              tone="primary"
              size="sm"
              onClick={submitValue}
            >
              {t("chat.submit")}
            </Button>
          ) : null}
        </div>
    </Dialog>
  );
}

export type ExtensionCustomRequest = Extract<ExtensionUiRequest, { method: "custom" }>;

function renderAnsiLine(line: string, keyPrefix: string): ReactNode[] {
  return parseAnsiLine(line).map((segment, index) => (
    <AnsiSegment key={`${keyPrefix}-${index}`} segment={segment} />
  ));
}

export function ExtensionCustomPanel({
  request,
  onInput,
}: {
  request: ExtensionCustomRequest;
  onInput: (request: ExtensionCustomRequest, data: string) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const displayLines = normalizeCustomPanelLines(request.lines);

  useEffect(() => {
    inputRef.current?.focus();
  }, [request.id]);

  return (
    <Dialog
      open
      // The terminal owns every key, including Escape, so the dialog must not
      // close on Escape or on a backdrop click.
      dismissible={false}
      title={t("chat.extensionPanel")}
      initialFocus={inputRef}
      className={styles.customPanel}
      onOpenChange={() => {}}
      onClick={(event) => {
        if (!(event.target instanceof Element && event.target.closest("button"))) inputRef.current?.focus();
      }}
    >
        <textarea
          ref={inputRef}
           aria-label={t("chat.extensionInput")}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            const data = toTerminalKeyData(event);
            if (!data) return;
            event.preventDefault();
            event.stopPropagation();
            onInput(request, data);
          }}
          onInput={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            const text = event.currentTarget.value;
            event.currentTarget.value = "";
            if (text) onInput(request, text);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            const input = event.currentTarget;
            queueMicrotask(() => {
              const text = input.value;
              input.value = "";
              if (text) onInput(request, text);
            });
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text");
            if (text) onInput(request, asBracketedPaste(text));
          }}
          className={styles.customPanelInput}
        />
        <div className={styles.customPanelHeader}>
          <Button
            size="sm"
            onClick={() => onInput(request, "\x03")}
          >
            {t("chat.close")}
          </Button>
        </div>
        <pre className={styles.customPanelOutput}>
          {(displayLines.length ? displayLines : [""]).map((line, index, allLines) => (
            <Fragment key={index}>
              {renderAnsiLine(line, `line-${index}`)}
              {index < allLines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </pre>
    </Dialog>
  );
}
