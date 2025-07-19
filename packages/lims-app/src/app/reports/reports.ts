import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';

interface ReportData {
  id: string;
  name: string;
  type: string;
  generatedDate: Date;
  generatedBy: string;
  fileSize: string;
  status: 'generating' | 'completed' | 'failed';
}

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  usageCount: number;
}

interface ScheduledReport {
  id: string;
  reportName: string;
  schedule: string;
  recipients: string[];
  lastGenerated: Date;
  nextRun: Date;
  status: 'active' | 'paused' | 'failed';
}

interface PreviewData {
  title: string;
  type: string;
  dateRange: string;
  department?: string;
  summary: { label: string; value: string }[];
  chartDescription: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './reports.html',
  styleUrl: './reports.scss'
})
export class Reports implements OnInit {
  // Form state
  reportForm!: FormGroup;
  showReportBuilder = false;
  
  // Modal state
  showPreviewModal = false;
  previewData: PreviewData | null = null;
  
  // Data
  recentReports: ReportData[] = [];
  reportTemplates: ReportTemplate[] = [];
  scheduledReports: ScheduledReport[] = [];

  constructor(private fb: FormBuilder) {
    this.initializeForm();
  }

  ngOnInit() {
    this.loadReportData();
  }

  private initializeForm() {
    this.reportForm = this.fb.group({
      reportType: ['', Validators.required],
      dateRange: ['today', Validators.required],
      startDate: [''],
      endDate: [''],
      department: [''],
      format: ['pdf', Validators.required]
    });
  }

  private loadReportData() {
    // Mock data - in real app, this would come from API
    this.recentReports = [
      {
        id: 'RPT-001',
        name: 'Daily Summary Report',
        type: 'test-volume',
        generatedDate: new Date('2024-01-15T09:30:00'),
        generatedBy: 'Lab Manager',
        fileSize: '2.3 MB',
        status: 'completed'
      },
      {
        id: 'RPT-002',
        name: 'TAT Analysis - Weekly',
        type: 'quality-metrics',
        generatedDate: new Date('2024-01-14T14:15:00'),
        generatedBy: 'Quality Coordinator',
        fileSize: '1.8 MB',
        status: 'completed'
      },
      {
        id: 'RPT-003',
        name: 'Department Productivity',
        type: 'department-productivity',
        generatedDate: new Date('2024-01-15T11:00:00'),
        generatedBy: 'Operations Manager',
        fileSize: '3.1 MB',
        status: 'generating'
      }
    ];

    this.reportTemplates = [
      {
        id: 'TPL-001',
        name: 'Monthly Quality Report',
        description: 'Comprehensive quality metrics and compliance reporting',
        type: 'quality-metrics',
        usageCount: 24
      },
      {
        id: 'TPL-002',
        name: 'Weekly TAT Summary',
        description: 'Turnaround time analysis by department and test type',
        type: 'quality-metrics',
        usageCount: 48
      },
      {
        id: 'TPL-003',
        name: 'Financial Dashboard',
        description: 'Revenue and cost analysis with trend reporting',
        type: 'financial-summary',
        usageCount: 12
      }
    ];

    this.scheduledReports = [
      {
        id: 'SCH-001',
        reportName: 'Daily Operations Summary',
        schedule: 'Daily at 7:00 AM',
        recipients: ['manager@lab.com', 'operations@lab.com'],
        lastGenerated: new Date('2024-01-15T07:00:00'),
        nextRun: new Date('2024-01-16T07:00:00'),
        status: 'active'
      },
      {
        id: 'SCH-002',
        reportName: 'Weekly Quality Report',
        schedule: 'Weekly on Monday',
        recipients: ['quality@lab.com', 'director@lab.com'],
        lastGenerated: new Date('2024-01-08T08:00:00'),
        nextRun: new Date('2024-01-22T08:00:00'),
        status: 'active'
      }
    ];
  }

  // Quick report generation
  generateDailyReport() {
    console.log('Generating daily report...');
    this.createReport('Daily Summary Report', 'test-volume');
  }

  generateTATReport() {
    console.log('Generating TAT report...');
    this.createReport('TAT Analysis Report', 'quality-metrics');
  }

  generateQualityReport() {
    console.log('Generating quality report...');
    this.createReport('Quality Control Report', 'quality-metrics');
  }

  generateWorkloadReport() {
    console.log('Generating workload report...');
    this.createReport('Workload Analysis Report', 'department-productivity');
  }

  private createReport(name: string, type: string) {
    const newReport: ReportData = {
      id: `RPT-${Date.now()}`,
      name,
      type,
      generatedDate: new Date(),
      generatedBy: 'Current User',
      fileSize: '0 KB',
      status: 'generating'
    };
    
    this.recentReports.unshift(newReport);
    
    // Simulate report generation
    setTimeout(() => {
      newReport.status = 'completed';
      newReport.fileSize = `${(Math.random() * 3 + 0.5).toFixed(1)} MB`;
    }, 3000);
  }

  // Report builder methods
  toggleReportBuilder() {
    this.showReportBuilder = !this.showReportBuilder;
  }

  generateCustomReport() {
    if (this.reportForm.valid) {
      const formValue = this.reportForm.value;
      const reportName = `${this.getReportTypeDisplay(formValue.reportType)} - ${formValue.dateRange}`;
      
      console.log('Generating custom report:', formValue);
      this.createReport(reportName, formValue.reportType);
    }
  }

  resetForm() {
    this.reportForm.reset({
      reportType: '',
      dateRange: 'today',
      startDate: '',
      endDate: '',
      department: '',
      format: 'pdf'
    });
  }

  previewReport() {
    if (!this.reportForm.valid) {
      return;
    }
    
    const formValue = this.reportForm.value;
    this.previewData = {
      title: `${this.getReportTypeDisplay(formValue.reportType)} Preview`,
      type: formValue.reportType,
      dateRange: this.getDateRangeDisplay(formValue.dateRange),
      department: formValue.department,
      summary: this.generatePreviewSummary(formValue.reportType),
      chartDescription: this.getChartDescription(formValue.reportType)
    };
    
    this.showPreviewModal = true;
  }

  private generatePreviewSummary(reportType: string): { label: string; value: string }[] {
    const summaries = {
      'test-volume': [
        { label: 'Total Tests', value: '1,234' },
        { label: 'Completed', value: '1,156' },
        { label: 'Pending', value: '78' },
        { label: 'Average TAT', value: '4.2 hrs' }
      ],
      'patient-demographics': [
        { label: 'Total Patients', value: '456' },
        { label: 'New Patients', value: '67' },
        { label: 'Age Range', value: '18-89' },
        { label: 'Gender Split', value: '52% F, 48% M' }
      ],
      'department-productivity': [
        { label: 'Tests Processed', value: '2,345' },
        { label: 'Avg Processing Time', value: '3.1 hrs' },
        { label: 'Efficiency Rate', value: '94.2%' },
        { label: 'Staff Utilization', value: '87%' }
      ],
      'financial-summary': [
        { label: 'Total Revenue', value: '$45,678' },
        { label: 'Cost per Test', value: '$12.34' },
        { label: 'Profit Margin', value: '23.5%' },
        { label: 'Outstanding', value: '$8,901' }
      ],
      'quality-metrics': [
        { label: 'QC Pass Rate', value: '98.7%' },
        { label: 'Repeat Rate', value: '1.8%' },
        { label: 'Critical Values', value: '23' },
        { label: 'Compliance Score', value: '96%' }
      ]
    };
    
    return summaries[reportType as keyof typeof summaries] || [];
  }

  private getChartDescription(reportType: string): string {
    const descriptions = {
      'test-volume': 'Bar chart showing daily test volumes by department',
      'patient-demographics': 'Pie charts showing age groups and gender distribution',
      'department-productivity': 'Line chart tracking productivity trends over time',
      'financial-summary': 'Revenue and cost analysis with monthly comparisons',
      'quality-metrics': 'Quality control trends and compliance metrics'
    };
    
    return descriptions[reportType as keyof typeof descriptions] || 'Data visualization chart';
  }

  closePreviewModal() {
    this.showPreviewModal = false;
    this.previewData = null;
  }

  generateFromPreview() {
    this.closePreviewModal();
    this.generateCustomReport();
  }

  // Report management
  downloadReport(report: ReportData) {
    console.log('Downloading report:', report.name);
    // In real app, would trigger download
  }

  viewReport(report: ReportData) {
    console.log('Viewing report:', report.name);
    // In real app, would open report viewer
  }

  deleteReport(report: ReportData) {
    if (confirm(`Are you sure you want to delete "${report.name}"?`)) {
      const index = this.recentReports.indexOf(report);
      if (index > -1) {
        this.recentReports.splice(index, 1);
      }
    }
  }

  refreshReports() {
    console.log('Refreshing reports list...');
    this.loadReportData();
  }

  // Template management
  useTemplate(template: ReportTemplate) {
    this.reportForm.patchValue({
      reportType: template.type
    });
    this.showReportBuilder = true;
    template.usageCount++;
  }

  createTemplate() {
    console.log('Creating new template...');
    // In real app, would open template creation dialog
  }

  // Scheduled reports management
  scheduleReport() {
    console.log('Opening schedule report dialog...');
    // In real app, would open scheduling dialog
  }

  editSchedule(scheduled: ScheduledReport) {
    console.log('Editing schedule:', scheduled.reportName);
    // In real app, would open edit dialog
  }

  pauseSchedule(scheduled: ScheduledReport) {
    scheduled.status = scheduled.status === 'active' ? 'paused' : 'active';
    console.log(`Schedule ${scheduled.status}:`, scheduled.reportName);
  }

  deleteSchedule(scheduled: ScheduledReport) {
    if (confirm(`Are you sure you want to delete the scheduled report "${scheduled.reportName}"?`)) {
      const index = this.scheduledReports.indexOf(scheduled);
      if (index > -1) {
        this.scheduledReports.splice(index, 1);
      }
    }
  }

  // Display methods
  getReportTypeDisplay(type: string): string {
    const typeMap: { [key: string]: string } = {
      'test-volume': 'Test Volume',
      'patient-demographics': 'Patient Demographics',
      'department-productivity': 'Department Productivity',
      'financial-summary': 'Financial Summary',
      'quality-metrics': 'Quality Metrics'
    };
    return typeMap[type] || type;
  }

  getStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      'generating': 'Generating',
      'completed': 'Completed',
      'failed': 'Failed'
    };
    return statusMap[status] || status;
  }

  getScheduleStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      'active': 'Active',
      'paused': 'Paused',
      'failed': 'Failed'
    };
    return statusMap[status] || status;
  }

  getDateRangeDisplay(dateRange: string): string {
    const rangeMap: { [key: string]: string } = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'this-week': 'This Week',
      'last-week': 'Last Week',
      'this-month': 'This Month',
      'last-month': 'Last Month',
      'custom': 'Custom Range'
    };
    return rangeMap[dateRange] || dateRange;
  }

  // Utility methods
  trackByReportId(index: number, report: ReportData): string {
    return report.id;
  }
}
