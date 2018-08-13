/* Copyright (C) 2016 NooBaa */

import template from './calendar.html';
import ko from 'knockout';
import moment from 'moment';
import { deepFreeze, makeArray } from 'utils/core-utils';

const weekDays = deepFreeze((() => {
    const iter = moment().startOf('week');
    return makeArray(7, () => {
        const s = iter.format('dd');
        iter.add(1, 'day');
        return s;
    });
})());

class CalendarViewModel {
    weekDays = weekDays;

    constructor(params) {
        const { value } = params;
        if (!ko.isWriteableObservable(value)) {
            throw TypeError('Invalid value, must be a writeable observable');
        }

        this.value = ko.pureComputed({
            read: () => moment(value() || Date.now())
                .startOf('day')
                .valueOf(),
            write: value
        });

        this.page = ko.observable(
            moment(this.value())
                .startOf('month')
                .valueOf()
        );

        this.sub = this.value.subscribe(val =>
            this.page(moment(val)
                .startOf('month')
                .valueOf()
            )
        );

        this.year = ko.pureComputed(() =>
            moment(this.page()).format('YYYY')
        );

        this.month = ko.pureComputed(() =>
            moment(this.page()).format('MMMM')
        );

        this.dates = ko.pureComputed(() => {
            const iter = moment(this.page());
            const month = iter.month();
            iter.startOf('Week');

            return makeArray(6 * 7, () => {
                const date = iter.valueOf();
                const text = iter.format('D');
                const disabled = iter.month() !== month;

                iter.add(1, 'day');
                return { date, text, disabled };
            });
        });
    }


    onNextMonth() {
        const nextPage = moment(this.page())
            .add(1, 'month')
            .valueOf();

        this.page(nextPage);
    }

    onPrevMonth() {
        const nextPage = moment(this.page())
            .subtract(1, 'month')
            .valueOf();

        this.page(nextPage);
    }

    onDate(date) {
        this.value(date);
    }

    dispose() {
        this.sub.dispose();
    }
}

export default {
    viewModel: CalendarViewModel,
    template: template
};
