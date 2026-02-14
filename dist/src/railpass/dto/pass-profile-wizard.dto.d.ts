export declare class PassProfileWizardDto {
    residencyCountry: string;
    passType: 'GLOBAL' | 'ONE_COUNTRY';
    oneCountryCode?: string;
    validityType: 'FLEXI' | 'CONTINUOUS';
    travelDaysTotal?: number;
    mobileOrPaper?: 'MOBILE' | 'PAPER';
    class?: 'FIRST' | 'SECOND';
    validityStartDate?: string;
    validityEndDate?: string;
    tripId: string;
}
