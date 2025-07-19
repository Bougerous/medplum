import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResultEntry } from './result-entry';

describe('ResultEntry', () => {
  let component: ResultEntry;
  let fixture: ComponentFixture<ResultEntry>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ResultEntry]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResultEntry);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
