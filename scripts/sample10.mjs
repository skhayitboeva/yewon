#!/usr/bin/env node
/**
 * Replaces the students/consultations collections with 10 small sample
 * records for local dev/demo purposes. Does not touch data/students.seed.json.
 */
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "yewon_sms";
if (!URI) {
  console.error("MONGODB_URI 환경변수를 설정하세요.");
  process.exit(1);
}

const now = new Date();

const students = [
  { studentId: "20260001", level: "학부", studentType: "신입생", nameKo: "왕리", nameEn: "WANG LI", birthDate: "2005-03-12", gender: "여", grade: "1", semesterNo: "1", enrollStatus: "재학", major: "경영전공", faculty: "국제매니지먼트학부", gradSchool: "", course: "", admissionDate: "2026-03-02", admissionType: "신입학", nationality: "중국", address: "서울 마포구 월드컵로 1", phone: "", mobile: "010-1111-0001", email: "wangli01@example.com", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "완납", total: 3500000, term1: 3500000, term2: 0, term3: 0, term4: 0, note: "" }, attendance: { absences: 0, note: "" } },
  { studentId: "20260002", level: "학부", studentType: "신입생", nameKo: "누르술탄", nameEn: "NURSULTAN AKHMETOV", birthDate: "2005-07-21", gender: "남", grade: "1", semesterNo: "1", enrollStatus: "재학", major: "실용음악전공", faculty: "예술대학", gradSchool: "", course: "", admissionDate: "2026-03-02", admissionType: "신입학", nationality: "카자흐스탄", address: "충북 청주시 흥덕구 2길 10", phone: "", mobile: "010-1111-0002", email: "", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "부분납부", total: 3500000, term1: 1500000, term2: 0, term3: 0, term4: 0, note: "" }, attendance: { absences: 1, note: "" } },
  { studentId: "20250013", level: "학부", studentType: "재학생", nameKo: "팜티투하", nameEn: "PHAM THI THU HA", birthDate: "2004-11-02", gender: "여", grade: "2", semesterNo: "3", enrollStatus: "재학", major: "관광경영전공", faculty: "국제매니지먼트학부", gradSchool: "", course: "", admissionDate: "2025-03-04", admissionType: "신입학", nationality: "베트남", address: "충북 음성군 대소면 1길 5", phone: "", mobile: "010-1111-0003", email: "", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "완납", total: 3500000, term1: 3500000, term2: 3500000, term3: 0, term4: 0, note: "" }, attendance: { absences: 2, note: "" } },
  { studentId: "20250027", level: "학부", studentType: "재학생", nameKo: "바트바야르", nameEn: "BATBAYAR ENKHBOLD", birthDate: "2003-05-18", gender: "남", grade: "2", semesterNo: "4", enrollStatus: "휴학", major: "실용음악전공", faculty: "예술대학", gradSchool: "", course: "", admissionDate: "2025-03-04", admissionType: "신입학", nationality: "몽골", address: "서울 노원구 3길 22", phone: "", mobile: "010-1111-0004", email: "", lastRegYear: "2025", lastRegSemester: "2", tuition: { status: "미납", total: 3500000, term1: 0, term2: 0, term3: 0, term4: 0, note: "휴학 중" }, attendance: { absences: 0, note: "휴학" } },
  { studentId: "20240041", level: "학부", studentType: "재학생", nameKo: "카디야틸로", nameEn: "KHADYATILLO RAKHMATULLO", birthDate: "2004-08-16", gender: "남", grade: "3", semesterNo: "5", enrollStatus: "재학", major: "경영전공", faculty: "국제매니지먼트학부", gradSchool: "", course: "", admissionDate: "2024-03-04", admissionType: "신입학", nationality: "우즈베키스탄", address: "충북 음성군 대소면 대화3길 4", phone: "", mobile: "010-1111-0005", email: "", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "미납", total: 3500000, term1: 0, term2: 0, term3: 0, term4: 0, note: "" }, attendance: { absences: 4, note: "결석 다수" } },
  { studentId: "20240055", level: "학부", studentType: "재학생", nameKo: "마리아곤잘레스", nameEn: "MARIA GONZALEZ", birthDate: "2003-01-30", gender: "여", grade: "3", semesterNo: "6", enrollStatus: "복학", major: "관광경영전공", faculty: "국제매니지먼트학부", gradSchool: "", course: "", admissionDate: "2024-03-04", admissionType: "신입학", nationality: "필리핀", address: "서울 강서구 5길 9", phone: "", mobile: "010-1111-0006", email: "", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "부분납부", total: 3500000, term1: 3500000, term2: 3500000, term3: 3500000, term4: 1000000, note: "" }, attendance: { absences: 1, note: "" } },
  { studentId: "20230078", level: "학부", studentType: "재학생", nameKo: "이완청", nameEn: "LI WANQING", birthDate: "2002-09-09", gender: "여", grade: "4", semesterNo: "7", enrollStatus: "재학", major: "경영전공", faculty: "국제매니지먼트학부", gradSchool: "", course: "", admissionDate: "2023-03-06", admissionType: "신입학", nationality: "중국", address: "서울 관악구 6길 11", phone: "", mobile: "010-1111-0007", email: "", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "완납", total: 3500000, term1: 3500000, term2: 3500000, term3: 3500000, term4: 3500000, note: "" }, attendance: { absences: 0, note: "" } },
  { studentId: "20220099", level: "학부", studentType: "재학생", nameKo: "쩐반남", nameEn: "TRAN VAN NAM", birthDate: "2001-12-25", gender: "남", grade: "4", semesterNo: "8", enrollStatus: "졸업", major: "실용음악전공", faculty: "예술대학", gradSchool: "", course: "", admissionDate: "2022-03-02", admissionType: "신입학", nationality: "베트남", address: "충북 청주시 상당구 7길 3", phone: "", mobile: "010-1111-0008", email: "", lastRegYear: "2025", lastRegSemester: "2", tuition: { status: "완납", total: 3500000, term1: 3500000, term2: 3500000, term3: 3500000, term4: 3500000, note: "" }, attendance: { absences: 0, note: "" } },
  { studentId: "20260010", level: "대학원", studentType: "신입생", nameKo: "아이누라", nameEn: "AINURA BEKOVA", birthDate: "1999-04-14", gender: "여", grade: "1", semesterNo: "1", enrollStatus: "재학", major: "음악학과", faculty: "", gradSchool: "일반대학원", course: "석사과정", admissionDate: "2026-03-02", admissionType: "신입학", nationality: "키르기스스탄", address: "서울 성북구 8길 2", phone: "", mobile: "010-1111-0009", email: "", lastRegYear: "2026", lastRegSemester: "1", tuition: { status: "완납", total: 4500000, term1: 4500000, term2: 0, term3: 0, term4: 0, note: "" }, attendance: { absences: 0, note: "" } },
  { studentId: "20250099", level: "대학원", studentType: "재학생", nameKo: "라시드", nameEn: "RASHID KARIMOV", birthDate: "1998-02-02", gender: "남", grade: "2", semesterNo: "3", enrollStatus: "제적", major: "경영학과", faculty: "", gradSchool: "일반대학원", course: "박사과정", admissionDate: "2025-03-04", admissionType: "편입학", nationality: "우즈베키스탄", address: "서울 동작구 9길 15", phone: "", mobile: "010-1111-0010", email: "", lastRegYear: "2025", lastRegSemester: "2", tuition: { status: "미납", total: 5000000, term1: 0, term2: 0, term3: 0, term4: 0, note: "제적 처리" }, attendance: { absences: 4, note: "제적" } },
].map((s) => ({
  ...s,
  contactCount: 0,
  memo: "",
  createdAt: now,
  updatedAt: now,
}));

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);

const { deletedCount: delStudents } = await db.collection("students").deleteMany({});
const { deletedCount: delConsults } = await db.collection("consultations").deleteMany({});
console.log(`기존 학생 ${delStudents}건, 상담 ${delConsults}건 삭제`);

const { insertedCount } = await db.collection("students").insertMany(students);
console.log(`샘플 학생 ${insertedCount}건 추가`);

await db
  .collection("settings")
  .updateOne({ _id: "app" }, { $set: { currentYear: 2026, currentSemester: 1 } }, { upsert: true });

await db.collection("info").updateOne(
  { _id: "app" },
  {
    $set: {
      tuitionDeadline: "2026-03-02 18:00까지",
      classTimeUndergraduate: "월~금 09:00–13:00",
      classTimeGraduate: "화·목 18:00–21:00",
      visaApplicationTime: "평일 09:00–17:00 (사전 예약)",
      orientation: "2026-02-27(금) 10:00, 본관 대강당",
    },
  },
  { upsert: true }
);

console.log("완료");
await client.close();
