import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { tError } from "../i18n";
import { useDomainLabel } from "../i18n/domainLabels";
import { formatKRW, tuitionPaid } from "../../shared/domain";

const STATUS_CHIP: Record<string, string> = {
  완납: "bg-[#e8f7e8] text-[#0a7d0a]",
  부분납부: "bg-[#fdf3dd] text-[#8a6100]",
  미납: "bg-[#fbeaea] text-critical",
};

const TERMS = [1, 2, 3, 4] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-ink">
        {value || value === 0 ? value : <span className="text-muted">—</span>}
      </div>
    </div>
  );
}

export function MyDetails({
  onToast,
}: {
  onToast: (kind: "ok" | "error", text: string) => void;
}) {
  const { t } = useTranslation(["profile", "students", "modals", "common"]);
  const domain = useDomainLabel();
  const { data, isLoading, error } = useQuery({ queryKey: ["myDetails"], queryFn: api.myDetails });

  if (isLoading) return <p className="p-6 text-sm text-muted">{t("common:states.loading")}</p>;
  if (error || !data) {
    onToast("error", tError("정보를 불러오지 못했습니다."));
    return <p className="p-6 text-sm text-critical">{tError("정보를 불러오지 못했습니다.")}</p>;
  }

  const { student: s, consultations, consultCount, lastConsultedAt } = data;
  const paid = tuitionPaid(s.tuition);

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:p-6">
      <Section title={t("profile:academicInfo")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t("students:columns.studentId")} value={s.studentId} />
          <Field label={t("students:columns.level")} value={domain.level(s.level)} />
          <Field label={t("students:columns.major")} value={s.major} />
          <Field label={t("students:columns.grade")} value={s.grade} />
          <Field label={t("students:columns.semesterNo")} value={s.semesterNo} />
          <Field label={t("students:columns.enrollStatus")} value={domain.enrollStatus(s.enrollStatus)} />
          <Field label={t("students:columns.admissionType")} value={s.admissionType} />
          <Field label={t("students:columns.admissionDate")} value={s.admissionDate} />
          <Field label={t("modals:addStudent.nationalityLabel")} value={s.nationality} />
        </div>
      </Section>

      <Section title={t("students:columns.tuition")}>
        <div className="flex items-center gap-2">
          <span className={`chip ${STATUS_CHIP[s.tuition?.status] ?? "bg-plane text-ink2"}`}>
            {domain.tuitionStatus(s.tuition?.status ?? "미납")}
          </span>
          <span className="nums text-sm text-ink2">
            {formatKRW(paid)} / {formatKRW(s.tuition?.total)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TERMS.map((n) => (
            <Field
              key={n}
              label={t("modals:tuition.termLabel", { n })}
              value={formatKRW(s.tuition?.[`term${n}` as "term1"])}
            />
          ))}
        </div>
        {s.tuition?.note && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink2">{s.tuition.note}</p>
        )}
      </Section>

      <Section title={t("students:columns.absences")}>
        <Field label={t("students:columns.absences")} value={s.attendance?.absences ?? 0} />
        {s.attendance?.note && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink2">{s.attendance.note}</p>
        )}
      </Section>

      {s.memo && (
        <Section title={t("students:columns.memo")}>
          <p className="whitespace-pre-wrap text-sm text-ink2">{s.memo}</p>
        </Section>
      )}

      <Section title={t("profile:consultHistory")}>
        <p className="mb-3 text-xs text-muted">
          {t("profile:consultCount")} {consultCount}
          {lastConsultedAt && ` · ${t("profile:lastConsulted")} ${lastConsultedAt}`}
        </p>
        {consultations.length === 0 ? (
          <p className="text-sm text-muted">{t("modals:consult.noRecords")}</p>
        ) : (
          <ul className="space-y-3">
            {consultations.map((row) => (
              <li key={row._id} className="card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nums text-sm font-bold">{row.date}</span>
                  {row.method && (
                    <span className="chip bg-plane text-ink2">{domain.consultMethod(row.method)}</span>
                  )}
                  {row.categories.map((c) => (
                    <span key={c} className="chip bg-[#eef3fa] text-brand">
                      {domain.consultCategory(c)}
                    </span>
                  ))}
                </div>
                {row.content && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{row.content}</p>
                )}
                {row.result && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink2">
                    <span className="font-semibold">
                      {t("modals:consult.resultLabel")}
                      {": "}
                    </span>
                    {row.result}
                  </p>
                )}
                {row.counselor && (
                  <p className="mt-1 text-xs text-muted">
                    {t("modals:consult.counselorLabel")} {row.counselor}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
