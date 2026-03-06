export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

export interface BusinessHours {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  open: string; // HH:MM
  close: string; // HH:MM
}

export interface Appointment {
  id: string;
  customerName: string;
  service: Service;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  status: 'confirmed' | 'cancelled';
}

const SERVICES: Service[] = [
  { id: 'haircut', name: 'Haircut', durationMinutes: 30, price: 35 },
  { id: 'consultation', name: 'Consultation', durationMinutes: 60, price: 75 },
  { id: 'dental-cleaning', name: 'Dental Cleaning', durationMinutes: 45, price: 120 },
  { id: 'massage', name: 'Massage', durationMinutes: 60, price: 90 },
];

const BUSINESS_HOURS: BusinessHours[] = [
  { dayOfWeek: 1, open: '09:00', close: '17:00' },
  { dayOfWeek: 2, open: '09:00', close: '17:00' },
  { dayOfWeek: 3, open: '09:00', close: '17:00' },
  { dayOfWeek: 4, open: '09:00', close: '17:00' },
  { dayOfWeek: 5, open: '09:00', close: '17:00' },
  { dayOfWeek: 6, open: '10:00', close: '14:00' },
];

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

let nextId = 1;

export class AppointmentStore {
  private appointments: Appointment[] = [];

  constructor() {
    // Seed with a couple of pre-existing appointments
    this.appointments.push({
      id: `apt-${nextId++}`,
      customerName: 'Alice Johnson',
      service: SERVICES[0],
      date: '2026-03-10',
      startTime: '10:00',
      endTime: '10:30',
      status: 'confirmed',
    });
    this.appointments.push({
      id: `apt-${nextId++}`,
      customerName: 'Bob Smith',
      service: SERVICES[2],
      date: '2026-03-10',
      startTime: '14:00',
      endTime: '14:45',
      status: 'confirmed',
    });
  }

  getServices(): Service[] {
    return SERVICES;
  }

  getBusinessHours(): BusinessHours[] {
    return BUSINESS_HOURS;
  }

  checkAvailability(
    date: string,
    serviceId?: string,
  ): { date: string; availableSlots: { time: string; endTime: string }[]; businessHours: BusinessHours | null } {
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const hours = BUSINESS_HOURS.find((h) => h.dayOfWeek === dayOfWeek) ?? null;

    if (!hours) {
      return { date, availableSlots: [], businessHours: null };
    }

    const service = serviceId ? SERVICES.find((s) => s.id === serviceId) : null;
    const duration = service?.durationMinutes ?? 30;

    const activeAppointments = this.appointments.filter(
      (a) => a.date === date && a.status === 'confirmed',
    );

    const slots: { time: string; endTime: string }[] = [];
    let current = hours.open;

    while (timeToMinutes(current) + duration <= timeToMinutes(hours.close)) {
      const end = addMinutes(current, duration);
      const conflict = activeAppointments.some((a) => {
        const slotStart = timeToMinutes(current);
        const slotEnd = timeToMinutes(end);
        const aptStart = timeToMinutes(a.startTime);
        const aptEnd = timeToMinutes(a.endTime);
        return slotStart < aptEnd && slotEnd > aptStart;
      });

      if (!conflict) {
        slots.push({ time: current, endTime: end });
      }

      current = addMinutes(current, 30); // 30-minute slot increments
    }

    return { date, availableSlots: slots, businessHours: hours };
  }

  bookAppointment(
    customerName: string,
    serviceId: string,
    date: string,
    time: string,
  ): { appointment: Appointment; confirmation: string } | { error: string } {
    const service = SERVICES.find((s) => s.id === serviceId);
    if (!service) {
      return { error: `Unknown service: ${serviceId}. Available: ${SERVICES.map((s) => s.id).join(', ')}` };
    }

    const endTime = addMinutes(time, service.durationMinutes);
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const hours = BUSINESS_HOURS.find((h) => h.dayOfWeek === dayOfWeek);

    if (!hours) {
      return { error: `We are closed on that day.` };
    }

    if (timeToMinutes(time) < timeToMinutes(hours.open) || timeToMinutes(endTime) > timeToMinutes(hours.close)) {
      return { error: `Time ${time}-${endTime} is outside business hours (${hours.open}-${hours.close}).` };
    }

    const conflict = this.appointments.find(
      (a) =>
        a.date === date &&
        a.status === 'confirmed' &&
        timeToMinutes(time) < timeToMinutes(a.endTime) &&
        timeToMinutes(endTime) > timeToMinutes(a.startTime),
    );

    if (conflict) {
      return { error: `Time slot conflicts with an existing appointment (${conflict.startTime}-${conflict.endTime}).` };
    }

    const appointment: Appointment = {
      id: `apt-${nextId++}`,
      customerName,
      service,
      date,
      startTime: time,
      endTime,
      status: 'confirmed',
    };

    this.appointments.push(appointment);
    return {
      appointment,
      confirmation: `Booked ${service.name} for ${customerName} on ${date} at ${time}-${endTime}. Appointment ID: ${appointment.id}`,
    };
  }

  cancelAppointment(appointmentId: string): { success: boolean; message: string } {
    const apt = this.appointments.find((a) => a.id === appointmentId);
    if (!apt) {
      return { success: false, message: `Appointment ${appointmentId} not found.` };
    }
    if (apt.status === 'cancelled') {
      return { success: false, message: `Appointment ${appointmentId} is already cancelled.` };
    }
    apt.status = 'cancelled';
    return { success: true, message: `Appointment ${appointmentId} has been cancelled.` };
  }

  listAppointments(customerName: string): Appointment[] {
    return this.appointments.filter(
      (a) => a.customerName.toLowerCase() === customerName.toLowerCase() && a.status === 'confirmed',
    );
  }

  rescheduleAppointment(
    appointmentId: string,
    newDate: string,
    newTime: string,
  ): { oldAppointment: Appointment; newAppointment: Appointment; confirmation: string } | { error: string } {
    const old = this.appointments.find((a) => a.id === appointmentId);
    if (!old) {
      return { error: `Appointment ${appointmentId} not found.` };
    }
    if (old.status === 'cancelled') {
      return { error: `Appointment ${appointmentId} is already cancelled.` };
    }

    // Cancel old
    old.status = 'cancelled';

    // Book new
    const result = this.bookAppointment(old.customerName, old.service.id, newDate, newTime);
    if ('error' in result) {
      // Restore old appointment
      old.status = 'confirmed';
      return { error: result.error };
    }

    return {
      oldAppointment: old,
      newAppointment: result.appointment,
      confirmation: `Rescheduled from ${old.date} ${old.startTime} to ${newDate} ${newTime}. New ID: ${result.appointment.id}`,
    };
  }
}
