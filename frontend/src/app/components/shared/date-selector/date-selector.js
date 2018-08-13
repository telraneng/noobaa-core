/* Copyright (C) 2016 NooBaa */

import template from './date-selector.html';
import ko from 'knockout';
import moment from 'moment';

const defaultFormat = 'DD MMM YYYY';

class DateSelectorViewModel {

    constructor(params) {
        const {
            hasFocus = false,
            placeholder = 'Select a date',
            value = ko.observable()
        } = params;

        this.focus = ko.observable(0).throttle(1);

        this.focus.subscribe(console.warn.bind(console));

        this.hasFocus = ko.isWritableObservable(hasFocus) ?
            hasFocus :
            ko.observable(ko.unwrap(hasFocus));

        this.placeholder = placeholder;
        this.value = value;

        this.text = ko.pureComputed(() => {
            const value = ko.unwrap(this.value);
            if (!value) {
                return ko.unwrap(placeholder);
            }

            return moment(value).format(defaultFormat);
        });

        this.showingPlaceholder = ko.pureComputed(() =>
            Boolean(ko.unwrap(value))
        );
    }

    onFocus() {
        this.focus(this.focus() + 1);
    }

    onBlur() {
        this.focus(this.focus() - 1);
    }
}

export default {
    viewModel: DateSelectorViewModel,
    template: template
};
