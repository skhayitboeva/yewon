import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useLang } from "../i18n";
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
  const { t, tLevel, tEnrollStatus } = useLang();
  const { data, isLoading, error } = useQuery({ queryKey: ["myDetails"], queryFn: api.myDetails });

  if (isLoading) return <p className="p-6 text-sm text-muted">{t("불러오는 중…")}</p>;
  if (error || !data) {
    onToast("error", t("정보를 불러오지 못했습니다."));
    return <p className="p-6 text-sm text-critical">{t("정보를 불러오지 못했습니다.")}</p>;
  }

  const { student: s, consultations, consultCount, lastConsultedAt } = data;
  const paid = tuitionPaid(s.tuition);

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:p-6">
      <Section title={t("학적 정보")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t("학번")} value={s.studentId} />
          <Field label={t("구분")} value={tLevel(s.level)} />
          <Field label={t("전공")} value={s.major} />
          <Field label={t("학년")} value={s.grade} />
          <Field label={t("학기차")} value={s.semesterNo} />
          <Field label={t("학적")} value={tEnrollStatus(s.enrollStatus)} />
          <Field label={t("입학구분")} value={s.admissionType} />
          <Field label={t("입학일자")} value={s.admissionDate} />
          <Field label={t("국적")} value={s.nationality} />
        </div>
      </Section>

      <Section title={t("등록금")}>
        <div className="flex items-center gap-2">
          <span className={`chip ${STATUS_CHIP[s.tuition?.status] ?? "bg-plane text-ink2"}`}>
            {t(s.tuition?.status ?? "미납")}
          </span>
          <span className="nums text-sm text-ink2">
            {formatKRW(paid)} / {formatKRW(s.tuition?.total)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TERMS.map((n) => (
            <Field
              key={n}
              label={t(`${n}차`)}
              value={formatKRW(s.tuition?.[`term${n}` as "term1"])}
            />
          ))}
        </div>
        {s.tuition?.note && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink2">{s.tuition.note}</p>
        )}
      </Section>

      <Section title={t("출결")}>
        <Field label={t("결석")} value={s.attendance?.absences ?? 0} />
        {s.attendance?.note && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink2">{s.attendance.note}</p>
        )}
      </Section>

      {s.memo && (
        <Section title={t("메모")}>
          <p className="whitespace-pre-wrap text-sm text-ink2">{s.memo}</p>
        </Section>
      )}

      <Section title={t("상담 이력")}>
        <p className="mb-3 text-xs text-muted">
          {t("상담 횟수")} {consultCount}
          {lastConsultedAt && ` · ${t("최근 상담일")} ${lastConsultedAt}`}
        </p>
        {consultations.length === 0 ? (
          <p className="text-sm text-muted">{t("아직 상담 기록이 없습니다.")}</p>
        ) : (
          <ul className="space-y-3">
            {consultations.map((row) => (
              <li key={row._id} className="card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nums text-sm font-bold">{row.date}</span>
                  {row.method && <span className="chip bg-plane text-ink2">{t(row.method)}</span>}
                  {row.categories.map((c) => (
                    <span key={c} className="chip bg-[#eef3fa] text-brand">
                      {t(c)}
                    </span>
                  ))}
                </div>
                {row.content && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{row.content}</p>
                )}
                {row.result && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink2">
                    <span className="font-semibold">
                      {t("조치 / 결과")}
                      {": "}
                    </span>
                    {row.result}
                  </p>
                )}
                {row.counselor && (
                  <p className="mt-1 text-xs text-muted">
                    {t("담당자")} {row.counselor}
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
