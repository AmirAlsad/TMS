import { tool } from 'ai';
import { z } from 'zod';
import type { AppointmentStore } from './store.js';

export function createTools(store: AppointmentStore) {
  return {
    get_services: tool({
      description: 'List all available services with their pricing and duration.',
      inputSchema: z.object({}),
      execute: async () => {
        return { services: store.getServices() };
      },
    }),

    get_business_hours: tool({
      description:
        'Get business hours for all days or a specific day of the week.',
      inputSchema: z.object({
        dayOfWeek: z
          .number()
          .min(0)
          .max(6)
          .optional()
          .describe('Day of week (0=Sunday, 1=Monday, ..., 6=Saturday). Omit to get all days.'),
      }),
      execute: async ({ dayOfWeek }) => {
        const hours = store.getBusinessHours();
        if (dayOfWeek !== undefined) {
          const day = hours.find((h) => h.dayOfWeek === dayOfWeek);
          return day ? { hours: [day] } : { hours: [], message: 'Closed on this day.' };
        }
        return { hours };
      },
    }),

    get_appointment_details: tool({
      description: 'Look up a specific appointment by its ID.',
      inputSchema: z.object({
        appointmentId: z.string().describe('The appointment ID to look up (e.g. "apt-1")'),
      }),
      execute: async ({ appointmentId }) => {
        const appointment = store.getAppointmentById(appointmentId);
        if (!appointment) {
          return { error: `Appointment ${appointmentId} not found.` };
        }
        return { appointment };
      },
    }),

    find_next_available: tool({
      description:
        'Find the next available date and time slots for a given service, starting from a specific date. Useful when a requested slot is unavailable.',
      inputSchema: z.object({
        serviceId: z
          .string()
          .describe('Service ID (e.g. "haircut", "consultation", "dental-cleaning", "massage")'),
        fromDate: z.string().describe('Starting date to search from in YYYY-MM-DD format'),
        maxDaysToSearch: z
          .number()
          .optional()
          .describe('Maximum number of days to search ahead (default: 14)'),
      }),
      execute: async ({ serviceId, fromDate, maxDaysToSearch }) => {
        const result = store.findNextAvailable(serviceId, fromDate, maxDaysToSearch);
        if (!result) {
          return { error: `No availability found in the next ${maxDaysToSearch ?? 14} days.` };
        }
        return result;
      },
    }),

    check_availability: tool({
      description:
        'Check available appointment time slots for a given date. Optionally filter by service to account for its duration.',
      inputSchema: z.object({
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
      inputSchema: z.object({
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
      inputSchema: z.object({
        appointmentId: z.string().describe('The appointment ID to cancel (e.g. "apt-1")'),
      }),
      execute: async ({ appointmentId }) => {
        return store.cancelAppointment(appointmentId);
      },
    }),

    list_appointments: tool({
      description: "List all upcoming confirmed appointments for a customer by name.",
      inputSchema: z.object({
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
      inputSchema: z.object({
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
