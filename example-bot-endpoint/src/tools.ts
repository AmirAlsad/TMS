import { tool } from 'ai';
import { z } from 'zod';
import type { AppointmentStore } from './store.js';

export function createTools(store: AppointmentStore) {
  return {
    check_availability: tool({
      description:
        'Check available appointment time slots for a given date. Optionally filter by service to account for its duration.',
      parameters: z.object({
        date: z.string().describe('Date to check in YYYY-MM-DD format'),
        serviceId: z
          .string()
          .optional()
          .describe('Optional service ID to filter slots by duration (e.g. "haircut", "consultation")'),
      }),
      execute: async ({ date, serviceId }) => {
        const availability = store.checkAvailability(date, serviceId);
        const services = store.getServices();
        return { ...availability, services };
      },
    }),

    book_appointment: tool({
      description:
        'Book an appointment for a customer. Requires customer name, service, date, and start time. Always confirm details with the customer before calling this.',
      parameters: z.object({
        customerName: z.string().describe('Full name of the customer'),
        serviceId: z
          .string()
          .describe('Service ID (e.g. "haircut", "consultation", "dental-cleaning", "massage")'),
        date: z.string().describe('Appointment date in YYYY-MM-DD format'),
        time: z.string().describe('Start time in HH:MM format (24-hour)'),
      }),
      execute: async ({ customerName, serviceId, date, time }) => {
        return store.bookAppointment(customerName, serviceId, date, time);
      },
    }),

    cancel_appointment: tool({
      description: 'Cancel an existing appointment by its ID.',
      parameters: z.object({
        appointmentId: z.string().describe('The appointment ID to cancel (e.g. "apt-1")'),
      }),
      execute: async ({ appointmentId }) => {
        return store.cancelAppointment(appointmentId);
      },
    }),

    list_appointments: tool({
      description: "List all upcoming confirmed appointments for a customer by name.",
      parameters: z.object({
        customerName: z.string().describe('Full name of the customer to look up'),
      }),
      execute: async ({ customerName }) => {
        const appointments = store.listAppointments(customerName);
        return { appointments, count: appointments.length };
      },
    }),

    reschedule_appointment: tool({
      description:
        'Reschedule an existing appointment to a new date and time. The old appointment is cancelled and a new one is created.',
      parameters: z.object({
        appointmentId: z.string().describe('The appointment ID to reschedule'),
        newDate: z.string().describe('New date in YYYY-MM-DD format'),
        newTime: z.string().describe('New start time in HH:MM format (24-hour)'),
      }),
      execute: async ({ appointmentId, newDate, newTime }) => {
        return store.rescheduleAppointment(appointmentId, newDate, newTime);
      },
    }),
  };
}
