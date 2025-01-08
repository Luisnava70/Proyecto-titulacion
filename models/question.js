import db from "./db.js";

export const questionsPerModule = async (moduleNumber) => {
    const result = await db.query("SELECT * FROM questions WHERE module_id = $1 AND is_used = TRUE", [
        moduleNumber,
    ]);
    return result.rows;
};

export const optionsPerQuestion = async (questionId) => {
    const result = await db.query("SELECT * FROM options WHERE question_id = $1", [questionId]);
    return result.rows;
};

export const isCorrectAnswer = async (optionId, questionId) => {
    const result = await db.query("SELECT * FROM answers WHERE question_id = $1", [questionId]);
    return result.rows[0].option_id === optionId;
};

export const getQuestionAndAnswer = async (questionId) => {
    const result = await db.query(
            `SELECT q.question_text, o.option_text AS answer_text
            FROM questions q
            JOIN answers a ON q.question_id = a.question_id
            JOIN options o ON a.option_id = o.option_id
            WHERE q.question_id = $1`, 
        [questionId]
    );
    return result.rows[0];
};

export const resetQuestions = async () => {
    await db.query("UPDATE questions SET is_used = FALSE WHERE is_used = TRUE");
};