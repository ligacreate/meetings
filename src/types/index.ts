export interface Event {
    id: number;
    garden_id?: number | null;
    title: string;
    date: string;
    time: string;
    city: string;
    source_timezone?: string | null;
    category: string;
    description: string;
    location: string;
    speaker: string;
    host_telegram: string;
    host_vk: string;
    registration_link?: string;
    price?: string;
    image_url?: string;
    image_gradient?: string;
    image_focus_x?: number | null;
    image_focus_y?: number | null;
}

export interface Notebook {
    id: number;
    title: string;
    description?: string;
    price?: string;
    image_url?: string;
    pdf_url?: string;
}
