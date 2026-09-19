import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { api, ApiError } from "../api";
import {
  ADMISSION_TYPES,
  ENROLL_STATUSES,
  GENDERS,
  LEVELS,
  STUDENT_TYPES,
  type Student,
} from "../../shared/domain";

const BLANK = {
  studentId: "",
  level: "학부",
  studentType: "신입생",
  nameKo: "",
  nameEn: "",
  birthDate: "",
  gender: "",
  grade: "",
  semesterNo: "",
  enrollStatus: "재학",
  major: "",
  faculty: "",
  gradSchool: "",
  course: "",
  admissionDate: "",
  admissionType: "신입학",
  nationality: "우즈베키스탄",
  address: "",
  phone: "",
  mobile: "",
  email: "",
  lastRegYear: "",
  lastRegSemester: "",
  contactCount: 0,
  memo: "",
};

function Field({
  label,
  children,
  span = 1,
}: {
  label: string;
  children: ReactNode;
  span?: 1 | 2 | 3;
}) {
  const cls = span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <div className={cls}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function AddStudentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (student: Student) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(BLANK);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: string) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const isGrad = form.level === "대학원";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.studentId.trim()) return setError("학번을 입력하세요.");
    if (!form.nameKo.trim()) return setError("성명을 입력하세요.");

    setBusy(true);
    setError("");
    try {
      const created = await api.createStudent({
        ...form,
        contactCount: Number(form.contactCount) || 0,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="학생 추가"
      subtitle="학번과 성명은 필수입니다. 나머지는 나중에 표에서 채울 수 있습니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">
            취소
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy} type="button">
            {busy ? "저장 중…" : "추가"}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="학번 *">
          <input className="field" value={form.studentId} onChange={set("studentId")} autoFocus />
        </Field>
        <Field label="성명 *">
          <input className="field" value={form.nameKo} onChange={set("nameKo")} />
        </Field>
        <Field label="성명(영문)">
          <input className="field" value={form.nameEn} onChange={set("nameEn")} />
        </Field>

        <Field label="구분">
          <select className="field" value={form.level} onChange={set("level")}>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="신입/재학">
          <select className="field" value={form.studentType} onChange={set("studentType")}>
            {STUDENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="학적">
          <select className="field" value={form.enrollStatus} onChange={set("enrollStatus")}>
            {ENROLL_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="생년월일">
          <input type="date" className="field" value={form.birthDate} onChange={set("birthDate")} />
        </Field>
        <Field label="성별">
          <select className="field" value={form.gender} onChange={set("gender")}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="국적">
          <input className="field" value={form.nationality} onChange={set("nationality")} />
        </Field>

        {isGrad ? (
          <>
            <Field label="대학원">
              <input className="field" value={form.gradSchool} onChange={set("gradSchool")} />
            </Field>
            <Field label="과정">
              <select className="field" value={form.course} onChange={set("course")}>
                <option value="">—</option>
                <option>석사과정</option>
                <option>박사과정</option>
              </select>
            </Field>
            <Field label="학기차">
              <input className="field" value={form.semesterNo} onChange={set("semesterNo")} />
            </Field>
          </>
        ) : (
          <>
            <Field label="학부">
              <input className="field" value={form.faculty} onChange={set("faculty")} />
            </Field>
            <Field label="학년">
              <input className="field" value={form.grade} onChange={set("grade")} />
            </Field>
            <Field label="입학구분">
              <select className="field" value={form.admissionType} onChange={set("admissionType")}>
                {ADMISSION_TYPES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="전공" span={isGrad ? 2 : 1}>
          <input className="field" value={form.major} onChange={set("major")} />
        </Field>
        <Field label="입학일자">
          <input
            type="date"
            className="field"
            value={form.admissionDate}
            onChange={set("admissionDate")}
          />
        </Field>

        <Field label="주소" span={3}>
          <input className="field" value={form.address} onChange={set("address")} />
        </Field>

        <Field label="휴대전화">
          <input className="field" value={form.mobile} onChange={set("mobile")} />
        </Field>
        <Field label="전화번호">
          <input className="field" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="이메일">
          <input className="field" value={form.email} onChange={set("email")} />
        </Field>

        <Field label="메모" span={3}>
          <textarea
            className="field min-h-[72px]"
            value={form.memo}
            onChange={set("memo") as any}
          />
        </Field>

        {error && (
          <p role="alert" className="sm:col-span-3 text-sm font-semibold text-critical">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
