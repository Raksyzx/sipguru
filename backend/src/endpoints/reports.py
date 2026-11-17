"""Attendance history and exports share the same validated filters and WIB dates."""

import csv
import io
from datetime import datetime
from typing import Literal, Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from src.attendance_history import WIB, attendance_time, build_history, build_sessions, history_dates, summarize
from src.database import get_db
from src.deps import get_current_user

router = APIRouter()
db = get_db()


class ReportFilters:
    def __init__(
        self,
        period: Literal["daily", "weekly", "monthly"] = Query("daily"),
        filter_type: Optional[Literal["day", "week", "month", "year"]] = Query(None),
        year: Optional[int] = Query(None, ge=1900, le=9998),
        month: Optional[int] = Query(None, ge=1, le=12),
        day: Optional[int] = Query(None, ge=1, le=31),
        week: Optional[int] = Query(None, ge=1, le=5),
        teacher_id: Optional[str] = Query(None, min_length=1, max_length=128),
        jurusan_id: Optional[str] = Query(None, min_length=1, max_length=128),
        grade_id: Optional[str] = Query(None, min_length=1, max_length=128),
        subject_id: Optional[str] = Query(None, min_length=1, max_length=128),
    ):
        now = datetime.now(WIB)
        self.period = period
        self.filter_type = filter_type
        self.year = year if year is not None else now.year
        self.month = month if month is not None else now.month
        self.day = day
        self.week = week
        self.teacher_id = teacher_id
        self.jurusan_id = jurusan_id
        self.grade_id = grade_id
        self.subject_id = subject_id


def _teacher_scope(auth_user, teacher_id):
    if auth_user.get("role") == "admin":
        return teacher_id
    if teacher_id and teacher_id != auth_user["user_id"]:
        raise HTTPException(status_code=403, detail="Anda hanya dapat membaca laporan sendiri")
    return auth_user["user_id"]


def _load_report(filters, auth_user, history=False):
    teacher_id = _teacher_scope(auth_user, filters.teacher_id)
    kind = filters.filter_type or ("month" if history else {
        "daily": "day", "weekly": "week", "monthly": "month",
    }[filters.period])
    try:
        start, end = history_dates(kind, filters.year, filters.month, filters.day, filters.week)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Tanggal atau minggu tidak valid untuk bulan yang dipilih") from error
    records = db.get_attendance_logs_by_period(
        start, end, teacher_id, filters.jurusan_id, filters.grade_id, filters.subject_id,
    )
    return {
        "period": kind, "filter_type": kind, "year": filters.year, "month": filters.month,
        "day": filters.day, "week": filters.week, "start_date": start, "end_date": end,
        "summary": summarize(records), "records": records,
    }


@router.get("/attendance")
async def get_attendance_report(
    filters: ReportFilters = Depends(), auth_user: dict = Depends(get_current_user),
):
    return _load_report(filters, auth_user)


@router.get("/attendance/history")
async def get_attendance_history(
    filters: ReportFilters = Depends(), auth_user: dict = Depends(get_current_user),
):
    report = _load_report(filters, auth_user, history=True)
    return build_history(
        report["records"], report["filter_type"], filters.year, filters.month, filters.day, filters.week,
    )


@router.get("/attendance/sessions")
async def get_attendance_sessions(
    filters: ReportFilters = Depends(), auth_user: dict = Depends(get_current_user),
):
    """Return flat list of attendance sessions (one row per absensi) with schedule details."""
    report = _load_report(filters, auth_user, history=True)
    return {"sessions": build_sessions(report["records"]), "summary": report["summary"]}


HEADERS = ["Tanggal", "Waktu (WIB)", "NIP", "Nama Guru", "Jurusan", "Kelas", "Mata Pelajaran", "Ruangan", "Status", "Keterlambatan (menit)"]


def _export_rows(report):
    for record in report["records"]:
        created = attendance_time(record["created_at"])
        yield [
            created.date().isoformat(), created.strftime("%H:%M"), record.get("nip") or "",
            record.get("teacher_name") or "", record.get("jurusan_name") or "-",
            record.get("grade_name") or "-", record.get("subject_name") or "-",
            record.get("room_name") or "", record["status"], record.get("lateness_minutes") or 0,
        ]


def _download(data, media_type, report, extension):
    filename = f"history_absensi_{report['start_date']}_to_{report['end_date']}.{extension}"
    return StreamingResponse(
        io.BytesIO(data), media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _csv_value(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


@router.get("/attendance/csv")
async def export_attendance_csv(
    filters: ReportFilters = Depends(), auth_user: dict = Depends(get_current_user),
):
    report = _load_report(filters, auth_user)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(HEADERS)
    for row in _export_rows(report):
        writer.writerow([_csv_value(value) for value in row])
    return _download(output.getvalue().encode("utf-8-sig"), "text/csv", report, "csv")


@router.get("/attendance/excel")
async def export_attendance_excel(
    filters: ReportFilters = Depends(), auth_user: dict = Depends(get_current_user),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    report = _load_report(filters, auth_user)
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.title = "History Absensi"
    sheet.append(HEADERS)
    for row in _export_rows(report):
        sheet.append(row)
        for cell in sheet[sheet.max_row]:
            if isinstance(cell.value, str):
                cell.data_type = "s"
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="064E3B")
    for index, width in enumerate([14, 14, 20, 28, 28, 22, 32, 24, 16, 24], 1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    summary = workbook.create_sheet("Ringkasan")
    summary.append(["Periode", f"{report['start_date']} s/d {report['end_date']}"])
    for label, field in [("Total Absensi", "total"), ("Tepat Waktu", "on_time"), ("Terlambat", "late"), ("Rate Tepat Waktu (%)", "attendance_rate")]:
        summary.append([label, report["summary"][field]])
    summary.column_dimensions["A"].width = 26
    summary.column_dimensions["B"].width = 30
    output = io.BytesIO()
    workbook.save(output)
    return _download(output.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", report, "xlsx")


@router.get("/attendance/pdf")
async def export_attendance_pdf(
    filters: ReportFilters = Depends(), auth_user: dict = Depends(get_current_user),
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

    report = _load_report(filters, auth_user)
    output = io.BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)
    styles = getSampleStyleSheet()
    body = ParagraphStyle("HistoryCell", fontSize=7, leading=9, wordWrap="CJK")
    header = ParagraphStyle("HistoryHeader", parent=body, textColor=colors.white)
    elements = [
        Paragraph("SIPGURU - History Absensi", styles["Title"]),
        Paragraph(f"Periode: {report['start_date']} s/d {report['end_date']} (WIB)", styles["Normal"]),
        Paragraph(f"Total: {report['summary']['total']} | Tepat waktu: {report['summary']['on_time']} | Terlambat: {report['summary']['late']}", styles["Normal"]),
        Spacer(1, 12),
    ]
    rows = [[Paragraph(escape(value), header) for value in HEADERS]]
    rows.extend([[Paragraph(escape(str(value)), body) for value in row] for row in _export_rows(report)])
    widths = [58, 42, 68, 102, 98, 75, 112, 93, 62, 35]
    table = LongTable(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#064e3b")),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
    ]))
    elements.append(table)
    document.build(elements)
    return _download(output.getvalue(), "application/pdf", report, "pdf")


@router.get("/teacher/{teacher_id}/summary")
async def get_teacher_summary(
    teacher_id: str, month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=1900, le=9998),
    auth_user: dict = Depends(get_current_user),
):
    _teacher_scope(auth_user, teacher_id)
    now = datetime.now(WIB)
    return db.get_teacher_summary(teacher_id, year or now.year, month or now.month)
